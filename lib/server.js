var URL = require('url')
var inherits = require('inherits')
var fs = require('fs-extra')
var path = require('path')

var _ = require('lodash')
var urljoin = require('url-join')
var async = require('async')
var request = require('request')

var BinderModule = require('binder-module')
var getLogger = require('binder-logging').getLogger
var getDatabase = require('binder-db').getDatabase
var settings = require('./settings.js')
var BuildInfoSchema = require('./build-info.js')
var Builder = require('binder-build-core')

var sources = require('./sources')
var registry = require('./registry')

/*
 * An HTTP server that implements the API of a Binder component
 * @constructor
 */
function BinderBuild (opts) {
  if (!(this instanceof BinderBuild)) {
    return new BinderBuild(opts)
  }
  BinderBuild.super_.call(this, 'binder-build', ['build', 'registry'], settings, opts)
  this.apps = this.opts.apps || './apps'
  this.logger = getLogger('binder-build')

  // db and buildInfo are set in _start
  this.db = null
  this.buildInfo = null
}
inherits(BinderBuild, BinderModule)

/**
 * Attached module's routes/handlers to the main app object
 */
BinderBuild.prototype._makeBinderAPI = function () {
  return {
    statusAll: this._getAllBuilds.bind(this),
    status: this._getBuild.bind(this),
    start: this._startBuild.bind(this),
    fetch: this._fetchTemplate.bind(this),
    fetchAll: this._fetchAllTemplates.bind(this)
  }
}

// binder-build API

/**
 * HTTP handler
 * Returns the statuses of all existing builds.
 */
BinderBuild.prototype._getAllBuilds = function (api) {
  if (!this.buildInfo) {
    return api._noBuildInfo()
  }
  this.buildInfo.find({}, function (err, infos) {
    if (err) {
      return api._badQuery({ error: err })
    }
    if (infos) {
      var formatted = _.map(infos, function (info) {
        return {
          'name': info.name,
          'start-time': info.startTime,
          'status': info.status,
          'phase': info.phase,
          'repository': info.repo,
          'error': info.error
        }
      })
      return api._success(formatted)
    }
    return api._success({})
  })
}

/**
 * HTTP handler
 * Returns the status of the name build if it exists, else 404.
 */
BinderBuild.prototype._getBuild = function (api) {
  var self = this
  if (!this.buildInfo) {
    return api._noBuildInfo()
  }
  console.log('api.params: {0}'.format(JSON.stringify(api.params)))
  this.buildInfo.findOne({ name: api.params['image-name'] }, function (err, info) {
    if (err) {
      return api._badQuery({ error: err })
    }
    if (!info || (info === {})) {
      return api._noBuildInfo()
    }
    return api._success({
      'name': info.name,
      'start-time': info.startTime,
      'status': info.status,
      'phase': info.phase,
      'repository': info.repo,
      'error': info.error
    })
  })
}

/**
 * HTTP handler
 * Creates a build from a POST body containing a "repo" field.
 */
BinderBuild.prototype._startBuild = function (api) {
  var self = this
  if (!this.buildInfo) {
    return api._noBuildInfo()
  }
  var repository = api.params.repository

  var imageName = sources.generateName(repository)
  var self = this
  var info = {
    name: imageName,
    repo: repository,
    phase: 'fetching',
    status: 'running',
    startTime: new Date()
  }

  var logger = getLogger(imageName)
  logger.rewriters.push(function (level, msg, meta) {
    meta.app = imageName
    return meta
  })

  var saveProgress = function (update) {
    return function () {
      var args = _.values(arguments)
      var next = args.slice(-1)[0]
      var applyArgs = args.slice(0, -1)
      _.assign(info, update)
      var updateOpts = { upsert: true, setDefaultsOnInsert: true }
      self.buildInfo.update({ name: imageName }, info, updateOpts , function (err) {
        if (err) {
          logger.error('could not save build info: {0}'.format(err))
        }
        if (next) {
          applyArgs.unshift(null)
          return next.apply(self, applyArgs)
        }
      })
    }
  }

  var startBuild = function (next) {
    logger.info('starting build for URL: {0}'.format(info.repo))
    var updateOpts = { upsert: true, setDefaultsOnInsert: true, new: true }
    self.buildInfo.findOneAndUpdate({ name: imageName }, info, updateOpts, function (err, info) {
      if (err) {
        api._badQuery({ error: err })
      }
      console.log('imageName: ' + imageName)
      console.log('info: ' + JSON.stringify(info))
      api._success({ 
        'repository': repository,
        'name': imageName,
        'start-time': info.startTime
      })
      return next(err)
    })
  }

  var fetchSource = function (next) {
    logger.info('fetching source at {0}'.format(info.repo))
    sources.fetchSource(repository, self.apps, imageName, function (err, dir) {
      if (err) return next(err)
      return next(null, imageName, dir)
    })
  }

  // build with the directory
  var buildImage = function (imageName, dirName, next) {
    if (dirName) {

      var buildOpts = _.assign({imageName: imageName, logger: logger}, self.opts)
      var builder = new Builder(buildOpts)
      var build = builder.build(dirName, function (err, imageSource) {
        return next(null, imageName, imageSource, dirName)
      })

      var status = build[0]
      var execute = build[1]
      var info = {
        imageName: imageName,
        status: status
      }

      status.on('build error', function () {
        return next(new Error("build failed for imageName: {0}".format(imageName)))
      })
      status.on('error', function () {
        return next(new Error("build failed for imageName: {0}".format(imageName)))
      })

      // execute the build
      execute()
    } else {
      return next(new Error('image source was not properly fetched'))
    }
  }

  // register the template
  var registerTemplate = function (imageName, sourceName, dirName, next) {
    logger.info('registering template for {0}'.format(imageName))
    return registry.createTemplate(self.templates, imageName, sourceName, dirName, next)
  }

  async.waterfall([
    startBuild,
    saveProgress({ phase: 'fetching' }),
    fetchSource,
    saveProgress({ phase: 'building' }),
    buildImage,
    saveProgress({ phase: 'registering' }),
    registerTemplate,
    saveProgress({ phase: 'finished' })
  ], function (err, result) {
    if (err) {
      logger.error('could not build image {0}: {1}'.format(info.name, err))
      info.status = 'failed'
      info.error = err.toString()
    } else {
      info.status = 'completed'
    }
    var updateOpts = { upsert: true, setDefaultsOnInsert: true }
    self.buildInfo.findOneAndUpdate({ name: imageName }, info, updateOpts, function (err) {
      if (err) {
        logger.error('could not save build info: {0}'.format(err))
      }
    })
  })
}

// binder-registry API

BinderBuild.prototype._fetchTemplate = function (api) {
  var self = this
  var name = api.params['template-name']
  registry.getTemplate(this.templates, name, function (err, template) {
    if (err) {
      return api._badDatabase()
    }
    if (!template) {
      return api._doesNotExist()
    }
    self.logger.info('found template with name {0} in database'.format(name))
    self.logger.info('template: {0}'.format(JSON.stringify(template)))
    return api._success(template)
  })
}

BinderBuild.prototype._fetchAllTemplates = function (api) {
  var self = this
  self.logger.info('searching for all templates')
  registry.getAllTemplates(this.templates, function (err, templates) {
    if (err) return api._badDatabase()
    self.logger.info('found {0} templates'.format(templates.length))
    return api._success(templates)
  })
}

/**
 * Performs all module-specific startup behavior
 */
BinderBuild.prototype._start = function (cb) {
  var self = this
  getDatabase(self.opts, function (err, conn) {
    if (err) throw err
    self.db = conn
    self.buildInfo = self.db.model('Build', BuildInfoSchema)
    self.templates = self.db.model('Template', registry.TemplateSchema)
    return cb()
  })
}

/**
 * Performs all module-specific stopping behavior
 */
BinderBuild.prototype._stop = function (cb) {
  return cb()
}

module.exports = BinderBuild

var URL = require('url')
var inherits = require('inherits')
var fs = require('fs-extra')
var path = require('path')

var _ = require('lodash')
var urljoin = require('url-join')
var async = require('async')
var request = require('request')
var tarball = require('tarball-extract')

var BinderModule = require('binder-module')
var getLogger = require('binder-logging').getLogger
var getDatabase = require('binder-db').getDatabase
var settings = require('./settings.js')
var BuildInfoSchema = require('./build-info.js')
var Builder = require('binder-build-core')

/*
 * An HTTP server that implements the API of a Binder component
 * @constructor
 */
function BinderBuild (opts) {
  if (!(this instanceof BinderBuild)) {
    return new BinderBuild(opts)
  }
  BinderBuild.super_.call(this, 'binder-build', 'build', settings, opts)
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
    statusOne: this._getBuild.bind(this),
    start: this._startBuild.bind(this)
  }
}

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
          'image-name': info.imageName,
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
 * Returns the status of the imageName build if it exists, else 404.
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
    if (info) {
      api._success({
        'image-name': info.name,
        'start-time': info.startTime,
        'status': info.status,
        'phase': info.phase,
        'repository': info.repo,
        'error': info.error
      })
    } else {
      return api._success({})
    }
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

  var url = URL.parse(repository)
  var processedPath = _.startsWith(url.pathname, '/') ? url.pathname.slice(1) : url.pathname
  var imageName = processedPath.replace('/', '-')
  var self = this
  var info = {
    name: imageName,
    repo: repository,
    phase: 'fetching',
    status: 'running'
  }

  var startBuild = function (next) {
    self.logger.info('starting build for URL: {0}'.format(info.repo))
    self.buildInfo.update({ name: imageName }, info, { upsert: true }, function (err) {
      if (err) {
        api._badQuery({ error: err })
      }
      api._success({ 
        'repository': repository,
        'image-name': imageName
      })
      return next(err)
    })
  }

  // TODO: extract the github fetching logic into a generic 'RepoHandler' -> modular way of 
  // fetching from different sources
  var fetchRepo = function (next) {
    self.logger.info('fetching repo at {0}'.format(info.repo))
    if (_.endsWith(url.hostname, 'github.com')) {
      var fileOpts = { mode: 0644, prefix: 'repo-', postfix: '.tar.gz' }
      tmp.file(fileOpts, function (err, fPath, fd, fCleanup) {
        if (err) {
          self.logger.error('could not create a temporary file: {0}'.format(err))
          return next(err)
        }
        fs.ensureDir(self.apps, function (err) {
          if (err) {
            self.logger.error('could not create the images directory: {0}'.format(err))
            return next(err)
          }
          var tarUrl = urljoin(url.format(), '/archive/master.tar.gz')
          var dirName = path.join(self.apps, imageName)
          info.dir = dirName
          var onClose = function () {
            tarball.extractTarball(fPath, dirName, function (err) {
              if (err) {
                self.logger.error('could not extract the GitHub repo tarball: {0}'.format(err))
                return next(err)
              }
              info.status = 'completed'
              next(null, imageName, dirName)
            })
          }
          request.get(tarUrl).on('response', function (response) {
            var writeStream = fs.createWriteStream(fPath)
            response.pipe(writeStream).on('close', onClose)
          })
        })
      })
    } else {
      next(new Error("unsupported repo source"))
    }
  }

  var saveProgress = function (imageName, dirName, next) {
    info.phase = 'running'
    self.buildInfo.update({ name: imageName }, info, { upsert: true }, function (err) {
      if (err) {
        self.logger.error('could not save build info: {0}'.format(err))
      }
      return next(null, imageName, dirName)
    })
  }

  // build with the directory
  var buildImage = function (imageName, dirName, next) {
    if (dirName) {

      var buildOpts = _.assign({imageName: imageName}, self.opts)
      var builder = new Builder(buildOpts)
      var build = builder.build(dirName)

      var status = build[0]
      var execute = build[1]
      var info = {
        imageName: imageName,
        url: url,
        status: status
      }

      status.on('build stop', function () {
        return next()
      })
      status.on('build error', function () {
        return next(new Error("build failed for imageName: {0}".format(imageName)))
      })

      // execute the build
      execute()
    } else {
      return next()
    }
  }

  async.waterfall([
    startBuild,
    fetchRepo,
    saveProgress,
    buildImage
  ], function (err, result) {
    if (err) {
      self.logger.error('could not build image {0}: {1}'.format(info.name, err))
      info.status = 'failed'
      info.error = err.toString()
    } else {
      info.status = 'completed'
    }
    self.buildInfo.findOneAndUpdate({ name: imageName }, info, { upsert: true }, function (err) {
      if (err) {
        self.logger.error('could not save build info: {0}'.format(err))
      }
    })
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

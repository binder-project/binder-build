var inherits = require('inherits')

var BinderModule = require('binder-module')
var getLogger = require('binder-logging').getLogger
var getDatabase = require('binder-db').getDatabase

var settings = require('./settings.js')
var Builder = require('binder-build-core')
var BuildInfo = require('./build-info.js').BuildInfo

/*
 * An HTTP server that implements the API of a Binder component
 * @constructor
 */
function BinderBuild (opts) {
  if (!(this instanceof BinderBuild)) {
    return new BinderBuild(opts)
  }
  BinderBuild.super_.call(this, settings, opts)
  this.apps = this.opts.apps || './apps'
  this.logger = getLogger('binder-build')

  // db and buildInfo are set in _start
  this.db = null
  this.buildInfo = null
}
inherits(BinderBuild, BinderModule)

var BuildInfo = {
  name: { type: String, unique: true },
  startTime: { type: Date, default: Date.now },
  status: String,
  phase: String,
  dir: String,
  repo: String
}

/**
 * Attached module's routes/handlers to the main app object
 */
BinderBuild.prototype._makeRoutes = function (app, authHandler) {
  app.route('/builds')
     .get(authHandler, this._getAllBuilds.bind(this))
     .post(authHandler, this._postBuild.bind(this))
  app.route('/builds/:imageName')
     .get(authHandler, this._getBuild.bind(this))
}

/**
 * HTTP handler
 * Returns the statuses of all existing builds.
 */
BinderBuild.prototype._getAllBuilds = function (req, res) {
  res.status(404).end()
}

/**
 * HTTP handler
 * Returns the status of the imageName build if it exists, else 404.
 */
BinderBuild.prototype._getBuild = function (req, res) {
  // check if imageName is in BuildInfo
  var imageName = req.params.imageName
  if (!this.buildInfo) {
    return res.status(500).send('could not get build info for: {0}'.format(imageName))
  }
  this.buildInfo.find({ name: imageName }, function (err, info) {
    if (info) {
      return res.json({
        imageName: info.name,
        startTime: info.startTime.toJSON(),
        status: info.status,
        phase: info.phase,
        repo: info.repo
      })
    } else {
      return res.json({})
    }
  })
}

/**
 * HTTP handler
 * Creates a build from a POST body containing a "repo" field.
 */
BinderBuild.prototype._postBuild = function (req, res) {
  var body = req.body

  if (!this.buildInfo) {
    return res.status(500).send('could not start build: database not yet initialized')
  }
  if (!body.repo) {
    return res.status(422).end()
  } else {
    res.status(200).end()
    var url = new URL(body.repo)
    var server = this
    var info = new this.buildInfo({
      repo: body.repo,
      startTime: new Date(),
      phase: 'fetching',
      status: 'running'
    })

    var startBuild = function (next) {
      self.logger.info('starting build for URL: {0}'.format(info.repo))
      info.save(function (err) {
        return next(err)
      })
    }

    // TODO: extract the github fetching logic into a generic 'RepoHandler' -> modular way of 
    // fetching from different sources
    var fetchRepo = function (next) {
      self.logger.info('fetching repo at {0}'.format(info.repo))
      if (_.contains(url.hostname, 'github.com')) {
        var imageName = url.pathname.slice(1).replace('/', '-')
        var fileOpts = { mode: 0644, prefix: 'repo-', postfix: '.tar.gz' }
        tmp.file(fileOpts, function (err, fPath, fd, fCleanup) {
          if (err) {
            self.logger.error('could not create a temporary file: {0}'.format(err))
            return next(err)
          }
          fs.ensureDir(server.apps, function (err) {
            if (err) {
              self.logger.error('could not create the images directory: {0}'.format(err))
              return next(err)
            }
            var tarUrl = urljoin(url, '/archive/master.tar.gz')
            var dirName = path.join(server.apps, imageName)
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
      info.phase = 'building'
      info.save(function (err) {
        if (err) {
          self.logger.error('could not save build info: {0}'.format(err))
        }
        return next(null, imageName, dirName)
      })
    }

    // build with the directory
    var buildImage = function (imageName, dirName, next) {
      if (dirName) {

        var buildOpts = _.assign({imageName: imageName}, server.opts)
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
      fetchRepo,
      buildImage
    ], function (err, result) {
      if (err) {
        self.logger.error('could not build image {0}: {1}',format(info.name, err))
        info.status = 'failed'
      } else {
        info.status = 'completed'
      }
      info.save(function (err) {
        if (err) {
          self.logger.error('could not save build info: {0}'.format(err))
        }
      })
    })
  }
}

/**
 * Performs all module-specific startup behavior
 */
BinderBuild.prototype._start = function (cb) {
  this.getDatabase(function (err, conn) {
    if (err) throw err
    this.db = conn
    this.buildInfo = db.model('Build', BuildInfo)
  })
}

/**
 * Performs all module-specific stopping behavior
 */
BinderBuild.prototype._stop = function (cb) {
  return cb()
}

module.exports = BinderBuild

var inherits = require('inherits')

var BinderModule = require('binder-module')
var getLogger = require('binder-logging').getLogger

var Builder = require('binder-build-core')
var BuildInfo = require('./build-info.js').BuildInfo

/*
 * An HTTP server that implements the API of a Binder component
 * @constructor
 */
function BinderBuild (opts) {
  if (!this instanceof BinderBuild) {
    return new BinderBuild(opts)
  }
  BinderBuild.super_.call(this, opts)
  this.apps = this.opts.apps || './apps'
  this.buildInfo = new BuildInfo()
  this.logger = getLogger('binder-build')
}

inherits(BinderBuild, BinderModule)

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
  if (!this.buildInfo.images[imageName]) {
    res.status(404).end()
  } else {
    var info = this.buildInfo.images[imageName]
    var response = {
      imageName: info.imageName,
      url: info.url,
      state: info.state
    }
    res.json(response)
  }
}

/**
 * HTTP handler
 * Creates a build from a POST body containing a "repo" field.
 */
BinderBuild.prototype._postBuild = function (req, res) {
  var body = req.body

  if (!body.repo) {
    return res.status(422).end()
  } else {

    var server = this

    // fetch and extract the repo directory
    var url = new URL(body.repo)

    var fetchRepo = function (next) {
      if (_.contains(url.hostname, 'github.com')) {
        var imageName = url.pathname.slice(1).replace('/', '-')
        var fileOpts = { mode: 0644, prefix: 'repo-', postfix: '.tar.gz' }
        tmp.file(fileOpts, function (err, fPath, fd, fCleanup) {
          if (err) {
            return next(err)
          }
          fs.ensureDir(server.apps, function (err) {
            if (err) {
              return next(err)
            }
            var tarUrl = urljoin(url, '/archive/master.tar.gz')
            var dirName = path.join(server.apps, imageName)
            var onClose = function () {
              tarball.extractTarball(fPath, dirName, function (err) {
                if (err) {
                  return next(err)
                }
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
        // add a BuildInfo entry
        server.buildInfo.addBuild(info)

        var buildRecord = server.buildInfo.getBuild(imageName)
        res.json(buildRecord)

        status.on('build stop', function () {
          next(null)
        })
        status.on('build error', function () {
          next(new Error("build failed for imageName {0}".format(imageName)))
        })

        // execute the build
        execute()
      }
    }

    async.waterfall([
      fetchRepo,
      buildImage
    ], function (err, result) {
      if (err) {
        res.status(500).end()
      }
      res.end()
    })
  }
}

/**
 * Performs all module-specific startup behavior
 */
BinderBuild.prototype._start = function () {
  // TODO :add startup behavior
}

/**
 * Performs all module-specific stopping behavior
 */
BinderBuild.prototype._stop = function () {
  // TODO :add stopping:w behavior
}

module.exports = BinderBuild

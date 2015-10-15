var http = require('http'),
    cluster = require('cluster'),
    path = require('path')
    numCPUs = require('os').cpus().length

var _ = require('lodash'),
    urljoin = require('url-join'),
    request = require('request'),
    hat = require('hat'),
    fs = require('fs-extra'),
    async = require('async')
    tmp = require('tmp'),
    tarball = require('tarball-extract'),
    express = require('express'),
    bodyParser = require('body-parser'),
    URL = require('url-parse'),
    format = require('string-format')
format.extend(String.prototype)

var Builder = require('binder-build-core')
var BuildInfo = require('./build-info.js').BuildInfo


/**
 * An HTTP server and build information data store that wraps
 * binder-build-core.
 * @constructor
 */
var BuildServer = function (options) {
  options = options || {}

  this.apiKey = options.apiKey || hat()
  console.log("apiKey: {0}".format(this.apiKey))
  this.port = options.port || 8080
  this.apps = options.apps || './apps'

  var app = express()
  var authHandler = function (req, res, next) {
    var credentials = req.headers["authorization"]
    if (credentials && credentials === this.apiKey) {
      next()
    } else {
      res.status(403).end()
    }
  }
  app.use(authHandler.bind(this))
  app.use(bodyParser.json())

  app.route('/builds')
     .get(this._getAllBuilds.bind(this))
     .post(this._postBuild.bind(this))
  app.route('/builds/:imageName')
     .get(this._getBuild.bind(this))

  this.builder = new Builder(this.opts)
  this.buildInfo = new BuildInfo()
  this.server = http.createServer(app)

  return this
}

/**
 * HTTP handler
 * Returns the statuses of all existing builds.
 */
BuildServer.prototype._getAllBuilds = function (req, res) {
  res.status(404).end()
}

/**
 * HTTP handler
 * Returns the status of the imageName build if it exists, else 404.
 */
BuildServer.prototype._getBuild = function (req, res) {
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
BuildServer.prototype._postBuild = function (req, res) {
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
        var fileOpts = {mode: 0644, prefix: 'repo-', postfix: '.tar.gz'}
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
        // add a BuildInfo entry
        var build = server.builder.build(dirName)
        var status = build[0]
        var execute = build[1]
        var info = {
          imageName: imageName,
          url: url,
          status: status
        }
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

BuildServer.prototype.start = function () {
  if (this.server) {
     console.log("Starting build server on port {0} ...".format(this.port))
     this.server.listen(this.port)
     return this.apiKey
  }
}

BuildServer.prototype.stop = function () {
  console.log("stopping build server...")
  if (this.server) {
    this.server.close()
  }
}

var start = function (opts) {
  var buildServer = new BuildServer(opts)
  var apiKey = buildServer.start()
  return {
    server: buildServer,
    apiKey: apiKey
  }
}

var stop = function () {
  // TODO
}

module.exports = {
  start: start,
  stop: stop
}

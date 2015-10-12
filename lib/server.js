var http = require('http'),
    cluster = require('cluster'),
    numCPUs = require('os').cpus().length

var hat = require('hat'),
    fs = require('fs-extra'),
    async = require('async')
    tar = require('tar-fs'),
    tmp = require('tmp'),
    express = require('express'),
    auth = require('basic-auth'),
    bodyParser = require('body-parser'),
    URL = require('url-parse'),
    routes = require('./routes.js'),
    format = require('string-format')
format.extend(String.prototype)

var Builder = require('binder-build-core')
var BuildInfo = require('./build-info.js')


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

  var app = express()
  app.use(function (req, res, next) {
    var credentials = auth(req)
    console.log("credentials: " + credentials)
    next()
  })
  app.user(bodyParser.json())

  app.route('/builds')
     .get(this._getAllBuilds)
     .post(this._postBuild)
  app.route('/builds/:imageName')
     .get(this._getBuild)

  this.builder = new Builder(this.opts)
  this.buildInfo = new BuildInfo()
  this.server = http.createServer(app)

  return this
}

BuildServer.prototype._getAllBuilds = function (req, res) {

}

BuildServer.prototype._getBuild = function (req, res, imageName) {
  // check if imageName is in BuildInfo
  if (!this.buildInfo.imageName) {
    res.status(404).end()
  } else {
    var info = this.buildInfo.imageName
    var response = {
      name: info.name,
      url: info.url,
      state = info.state
    }
    res.json(response)
  }
}

BuildServer.prototype._postBuild = function (req, res) {
  var body = req.body

  if (!body.repo) {
    return res.status(422).end()
  } else {

    // fetch the repo directory
    var url = new URL(body.repo)

    var fetchRepo = function (next) {
      if (url.hostname === 'github.com') {
        var imageName = url.pathname.slice(1)
        var fileOpts = {mode: 0644, prefix: 'repo-', postfix: '.tar'}
        tmp.file(fileOpts, function (err, fPath, fd, fCleanup) {
          if (err) {
            return next(err)
          }
          var file = fs.createWriteStream(fPath);
          var request = http.get(url + '/tarball', function(response) {
            response.on('end', function () {
              next(null, imageName, fPath)
            })
            response.pipe(file)
          })
        })
      } else {
        next(new Error("unsupported repo source"))
      }
    }

    // extract the tarball into an app directory
    var extractRepo = function (imageName, fPath, next) {
      fs.ensureDir('./apps', function (err) {
        if (err) {
          return next(err)
        }
       var dirName = path.join('./apps', imageName)
       var stream =  fs.createReadStream(fPath)
       stream.on('end', function () {
         next(null, dirName)
       })
       stream.pipe(tar.extract(dirName))
      })
    }

    // build with the directory
    var buildImage = function (dirName, next) {
      if (dir) {
        // add a BuildInfo entry
        var build = this.builder.build(dir)
        var status = build[0]
        var execute = build[1]
        var info = {
          name: name
          url: url
          status: status
        }
        this.buildInfo.addBuild(info)

        // execute the build
        execute()
        next(null)
      }
    }

    async.waterfall([
      fetchRepo,
      extractRepo,
      buildImage
    ], function (err, result) {
      if (err) {
        res.status(500).end()
      }
    })
  }
}

BuildServer.prototype.start = function () {
  if (this.server) {
     console.log("Starting build server on port ...")
     this.server.listen(this.port)
  }
}

BuildServer.prototype.stop = function () {
  console.log("stopping build server...")
}

var start = function (opts) {
  var buildServer = new BuildServer(opts)
  buildServer.start()
}

var stop = function () {
  // TODO
}

module.exports = {
  start: start,
  stop: stop
}

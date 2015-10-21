var assert = require('assert')

var _ = require('lodash')
var request = require('request')
var async = require('async')
var format = require('string-format')
format.extend(String.prototype)

var serverCtl = require('../lib/server.js')
var BuildStatus = require('../lib/build-info.js').BuildStatus

var requirementsTest = function () {

  // start the build server
  var info = serverCtl.start()
  var server = info.server
  var apiKey = info.apiKey

  // build binder-project-example-requirements
  var startBuild = function (next) {
    var options = {
      url: 'http://localhost:8080/builds',
      json: {'repo': 'http://www.github.com/binder-project/example-requirements'},
      headers: {
        'Authorization': apiKey
      }
    }
    request.post(options, function (error, response, body) {
      if (error) {
        assert.fail(error, null)
        return next(error)
      } else {
          assert(typeof body === 'object')
          assert.notEqual(body.imageName, null)
          next(null, body.imageName)
      }
    })
  }

  // query results
  var queryBuild = function (imageName, next) {
    var buildStatus = null

    var _query = function (cb) {
      setTimeout(function () {
        var options = {
          url: 'http://localhost:8080/builds/{0}'.format(imageName),
          headers: {
            'Authorization': apiKey
          }
        }
        request.get(options, function (error, response, body) {
          if (error) {
            assert.fail(error, null)
            return cb(error)
          }
          var jsonBody = JSON.parse(body)
          assert.notEqual(jsonBody.imageName, null)
          assert.notEqual(jsonBody.url, null)
          assert.notEqual(jsonBody.state, null)
          if (jsonBody.state) {
            buildStatus = jsonBody.state
          }
          cb(null)
        })
      }, 500)
    }
    var check = function () {
      return buildStatus && (buildStatus === BuildStatus.COMPLETED ||
                             buildStatus === BuildStatus.FAILED)
    }
    async.doUntil(_query, check, function (err) {
      if (err) {
        return next(err)
      }
      assert.notEqual(buildStatus, BuildStatus.FAILED)
      next(null)
    })
  }

  // stop the server
  var stopServer = function (next) {
    server.stop()
    next(null)
  }

  async.waterfall([
    startBuild,
    queryBuild,
    stopServer
  ], function (err, result) {
    if (err) {
      assert.fail(err)
    }
  })
}

module.exports = [
  requirementsTest
]

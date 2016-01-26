var assert = require('assert')

var _ = require('lodash')
var request = require('request')
var async = require('async')
var format = require('string-format')
format.extend(String.prototype)

var settings = require('../lib/settings.js')
var BuildServer = require('../lib/server.js')
var BuildStatus = require('../lib/build-info.js').BuildStatus

describe('binder-build', function () {
  describe('BinderBuild', function () {
  })
  describe('CLI', function () {
    var server, apiKey = null
    var imageName

    before(function (done) {
      var server = new BuildServer(settings)
      server.on('start', function () {
        apiKey = server.apiKey
        done()
      })
      server.start()
    })

    it('should correctly start a build', function (done) {
      var options = {
        url: 'http://localhost:8080/builds',
        json: {'repo': 'http://www.github.com/rlabbe/kalman-and-bayesian-filters-in-python'},
        headers: {
          'Authorization': apiKey
        }
      }
      request.post(options, function (err, response, body) {
        if (err) throw err
        assert(typeof body === 'object')
        assert.notEqual(body.imageName, null)
        imageName = body.imageName
        done()
      })
    })

    it('should correctly query the status of a build', function (done) {
      var buildStatus = null

      var _query = function (cb) {
        setTimeout(function () {
          var options = {
            url: 'http://localhost:8080/builds/{0}'.format(imageName),
            json: true,
            headers: {
              'Authorization': apiKey
            }
          }
          request.get(options, function (err, response, body) {
            if (err) return cb(err)
            assert.notEqual(body.imageName, null)
            assert.notEqual(body.url, null)
            assert.notEqual(body.state, null)
            if (body.state) {
              buildStatus = body.state
            }
            return cb(null)
          })
        }, 500)
      }
      var check = function () {
        return buildStatus && (buildStatus === BuildStatus.COMPLETED ||
                               buildStatus === BuildStatus.FAILED)
      }
      async.doUntil(_query, check, function (err) {
        if (err) throw err
        assert.notEqual(buildStatus, BuildStatus.FAILED)
        done()
      })
    })
  })
})

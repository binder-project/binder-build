var assert = require('assert')

var _ = require('lodash')
var request = require('request')
var urljoin = require('url-join')
var async = require('async')
var format = require('string-format')
format.extend(String.prototype)

var settings = require('../lib/settings.js')
var BuildServer = require('../lib/server.js')
var BuildInfoSchema = require('../lib/build-info.js')
var getDatabase = require('binder-db').getDatabase

describe('binder-build', function () {
  var BuildInfo
  var baseUrl = 'http://{0}:{1}'.format(settings.host, settings.port)

  before(function (done) {
    getDatabase(function (err, conn) {
      if (err) throw err
      BuildInfo = conn.model('Build', BuildInfoSchema)
      done()
    })
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
        url: baseUrl + '/builds',
        json: {'repository': 'http://www.github.com/binder-project/example-requirements'},
        headers: {
          'Authorization': apiKey
        }
      }
      request.post(options, function (err, response, body) {
        if (err) throw err
        assert.equal(typeof body, 'object')
        assert.notEqual(body['image-name'], null)
        imageName = body['image-name']
        done()
      })
    })

    it('should correctly query the status of a build', function (done) {
      this.timeout(60000 * 5)
      var buildStatus = null

      var _query = function (cb) {
        setTimeout(function () {
          var options = {
            url: baseUrl + '/builds/{0}'.format(imageName),
            json: true,
            headers: {
              'Authorization': apiKey
            }
          }
          request.get(options, function (err, response, body) {
            if (err) return cb(err)
            assert.notEqual(body['image-name'], null)
            assert.notEqual(body['repository'], null)
            assert.notEqual(body['status'], null)
            if (body.status) {
              buildStatus = body.status
            }
            return cb(null)
          })
        }, 500)
      }
      var check = function () {
        return buildStatus && (buildStatus === 'completed' ||
                               buildStatus === 'failed')
      }
      async.doUntil(_query, check, function (err) {
        if (err) throw err
        assert.notEqual(buildStatus, 'failed')
        done()
      })
    })

    it('should return a registered template for a completed build', function (done) {
      var opts = {
        url: urljoin(baseUrl, 'templates', imageName),
        method: 'GET',
        headers: {
          'Authorization': apiKey
        },
        json: true
      }
      request(opts, function (err, rsp, body) {
        if (err) throw err
        assert.equal(body['name'], imageName)
        done()
      })
    })

    it('should throw an error when asked for a nonexistent template', function (done) {
      var opts = {
        url: urljoin(baseUrl, 'templates', 'binder-example-requirements-blahblah'),
        method: 'GET',
        headers: {
          'Authorization': apiKey
        },
        json: true
      }
      request(opts, function (err, rsp, body) {
        if (err) throw err
        assert.notEqual(body['name'], imageName)
        assert.equal(body.type, 'doesNotExist')
        done()
      })
    })
  })
})

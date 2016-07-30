var fs = require('fs')
var URL = require('url')
var path = require('path')

var _ = require('lodash')
var request = require('request')
var format = require('string-format')
var urljoin = require('url-join')
var gunzip = require('gunzip-maybe')
var tar = require('tar')
var rimraf = require('rimraf')

var canProcess = function (source) {
  var url = typeof source === 'object' && source.html_url
    ? URL.parse(source.html_url)
    : URL.parse(source)

  return _.endsWith(url.hostname, 'github.com')
}

var host = 'https://api.github.com'
var headers = { Authorization: 'token ' + process.env.BINDER_GITHUB_TOKEN, 'User-Agent': 'Binder' }

var fetchData = function (source, callback) {
  var fragments = URL.parse(source).path.split('/').filter(function (fragment) {
    return fragment
  })

  var owner = fragments[0]
  var repo = fragments[1]
  var options = { url: host + '/repos/' + owner + '/' + repo, headers: headers, json: true }
  request(options, function (err, res, body) {
    callback(err, body)
  })
}

var fetchTarball = function (source, dir, callback) {
  var options = { url: source.url + '/tarball/' + source.default_branch, headers: headers }

  request(options)
    .pipe(gunzip())
    .pipe(tar.Extract({ path: dir, strip: 1 }))
    .on('error', function (err) {
      return callback(err)
    })
    .on('end', function () {
      callback(null, dir)
    })
}

var fetchSource = function (source, dir, next) {
  fs.exists(dir, function (exists) {
    if (exists) {
      rimraf(path.resolve(dir), function (err) {
        if (err) return next(err)
        fetchTarball(source, dir, next)
      })
    } else {
      fetchTarball(source, dir, next)
    }
  })
}

var _processPath = function (source) {
  var url = URL.parse(source.html_url)
  return _.startsWith(url.pathname, '/') ? url.pathname.slice(1) : url.pathname
}

var generateName = function (source) {
  return _processPath(source).split('/').join('-') + '-' + source.default_branch
}

var generateDisplayName = function (source) {
  return _processPath(source) + '/' + source.default_branch
}

module.exports = {
  canProcess: canProcess,
  fetchData: fetchData,
  fetchSource: fetchSource,
  generateName: generateName,
  generateDisplayName: generateDisplayName
}


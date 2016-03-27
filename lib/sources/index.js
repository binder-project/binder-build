var _ = require('lodash')
var fs = require('fs-extra')
var path = require('path')

var sources = {
  'github': require('./github')
}

var findHandler = function (source) {
  var handler = _.find(sources, function (handler, name) {
    return handler.canProcess(source)
  })
  return handler
}

var fetchSource = function (source, dir, name, cb) {
  var dirName = path.join(dir, name)
  fs.ensureDir(dirName, function (err) {
    console.log('err: ' + err)
    if (err) {
      return cb(err)
    }
    var handler = findHandler(source)
    if (handler) {
      handler.fetchSource(source, dirName, cb)
    } else {
      return cb(new Error('unsupported source'))
    }
  })
}

var generateName = function (source) {
  console.log('generating name for source {0}'.format(source))
  var handler = findHandler(source)
  if (handler) {
    return handler.generateName(source) 
  }
  return source
}

module.exports = {
  fetchSource: fetchSource,
  generateName: generateName
}


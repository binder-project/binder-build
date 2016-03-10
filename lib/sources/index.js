var _ = require('lodash')
var path = require('path')

var sources = {
  'github': require('./github')
}

var findHandler = function (source) {
  var handler = _.find(sources, function (handler, name) {
    return handler.canProcess(source)
  })
}

var fetchSource = function (source, name, cb) {
  var dirName = path.join(self.apps, name)
  fs.ensureDir(self.apps, function (err) {
    if (err) {
      self.logger.error('could not create the images directory: {0}'.format(err))
      return next(err)
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
  var handler = findHandler(source)
  if (handler) {
    return handler.generateName(source) 
  }
  return null
}

module.exports = {
  fetchSource: fetchSource,
  generateName: generateName
}


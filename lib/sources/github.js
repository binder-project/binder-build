var _ = require('lodash')
var request = require('request')
var tmp = require

var canProcess = function (name) {
  _.endsWith(url.hostname, 'github.com')
}

var fetchSource = function (source, dir, next) {
  var tarUrl = urljoin(source, '/archive/master.tar.gz')
  var dirName = path.join(dir, imageName)
  var tarStream = request(tarUrl)
    .pipe(gunzip())
    .pipe(tar.Extract({ path: dirName, strip: 1 }))
  .on('error', function (response) {
     self.logger.error('could not extract the GitHub repo tarball: {0}'.format(err))
     return next(err)
  })
  .on('end', function () {
    next(null, dirName)
  })
}

var generateName(source) {
  var url = URL.parse(source)
  var processedPath = _.startsWith(url.pathname, '/') ? url.pathname.slice(1) : url.pathname
  return processedPath.replace('/', '-')
}

module.exports = {
  canProcess: canProcess,
  fetchSource: fetchSource,
  generateName: generateName
}


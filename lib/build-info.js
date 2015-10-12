
/**
 * The build information data store. By default, this stores all
 * build information in memory
 * @constructor
 */
function BuildInfo(opts) {
  this.opts = opts
  this.images = {}
}

/**
 * Creates a build info record and subscribes to status updates for
 * the build.
 * @param {BuildStatus} status - A binder-build-core BuildStatus
 */
BuildInfo.prototype.addBuild = function (info) {
  var name = status.name
  info.state = "SUBMITTED"
  info.progress = null
  info.phase = null
  this.image[name] = info
  info.status.on('build start', function () {
    this.images.name.status = "BUILDING"
  })
  info.status.on('build stop', function () {
    this.images.name.status = "COMPLETED"
  })
  info.status.on('build error', function () {
    this.images.name.status = "FAILED"
  })

  // TODO store phase/progress information
}

/**
 * Deletes the build info record for an image, if it exists, and
 * unsubscribes from build status updates.
 * @param {string} name - Name of an image
 */
BuildInfo.prototype.removeBuild = function (name) {
  if (this.images.name) {
    delete this.images[name]
  }
}


module.exports = BuildInfo

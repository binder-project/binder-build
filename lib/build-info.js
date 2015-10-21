
/**
 * The build information data store. By default, this stores all
 * build information in memory
 * @constructor
 */
function BuildInfo(opts) {
  this.opts = opts
  this.images = {}
}

var BuildStatus = {
  BUILDING: "BUILDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
}

/**
 * Creates a build info record and subscribes to status updates for
 * the build.
 * @param {BuildStatus} status - A binder-build-core BuildStatus
 */
BuildInfo.prototype.addBuild = function (info) {
  var buildInfo = this

  var name = info.imageName
  info.state = "SUBMITTED"
  info.progress = null
  info.phase = null
  this.images[name] = info

  info.status.on('build start', function () {
    buildInfo.images[name].state = BuildStatus.BUILDING
  })
  info.status.on('build stop', function () {
    buildInfo.images[name].state = BuildStatus.COMPLETED
  })
  info.status.on('build error', function () {
    buildInfo.images[name].state = BuildStatus.FAILED
  })

  // TODO store phase/progress information
}

/**
 * Returns the info record associated with an imageName
 * @param {string} name - Name of image being built
 */
BuildInfo.prototype.getBuild = function (name) {
  return this.images[name]
}

/**
 * Deletes the build info record for an image, if it exists, and
 * unsubscribes from build status updates.
 * @param {string} name - Name of an image
 */
BuildInfo.prototype.removeBuild = function (name) {
  if (this.images[name]) {
    delete this.images[name]
  }
}


module.exports = {
  BuildInfo: BuildInfo,
  BuildStatus: BuildStatus
}

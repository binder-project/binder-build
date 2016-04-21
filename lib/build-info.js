module.exports = {
  name: { type: String, unique: true },
  displayName: { type: String, unique: true },
  startTime: { type: Date, default: Date.now },
  status: String,
  phase: String,
  dir: String,
  repo: String,
  error: String
}


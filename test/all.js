var _ = require('lodash')

tests = [
  require('./test-build.js')
]

_.forEach(_.flatten(tests), function (test) {
  test()
})



var _ = require('lodash')

tests = [
  require('./test-build.js')
]

_.forEach(tests, function (test) {
  test()
})



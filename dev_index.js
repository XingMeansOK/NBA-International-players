var MapboxWrapper = require( './src/index.js' );
var THREE = require( './src/lib/three.js' );

// 使用的是commomjs的规范，模块内的东西都是私有的，所以在dev.html的script中读不到MapboxWrapper
window.MapboxWrapper = MapboxWrapper;
window.THREE = THREE;

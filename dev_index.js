var MapboxWrapper = require( './src/index.js' );
var _json = require( './data/dev.geojson' );

// 使用的是commomjs的规范，模块内的东西都是私有的，所以在dev.html的script中读不到MapboxWrapper
window.MapboxWrapper = MapboxWrapper;

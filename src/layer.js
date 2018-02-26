var THREE = require( './lib/three.js' );
var constants = require( './constant.js' );

/*
  所有图层的父类，继承自three Group
*/
function Layer() {

  THREE.Group.call( this );

}

Layer.prototype = Object.assign( Object.create( THREE.Group.prototype ), {

  constructor: Layer,

  /**
   * 在指定位置添加three要素
   * @param  {Object} obj     [Mesh]
   * @param  {Array} lnglat  [经纬度]
   * @param  {Object} options [description]
   * @return {[type]}         [description]
   */
  addAtCoordinate: function(obj, lnglat, options) {
       var geoGroup = new THREE.Group();
       geoGroup.userData.isGeoGroup = true;
       geoGroup.add(obj);
       this.add(geoGroup);
       this.moveToCoordinate(obj, lnglat, options);

       // Bestow this mesh with animation superpowers and keeps track of its movements in the global animation queue
       //this.animationManager.enroll(obj);

       return obj;
   },

   moveToCoordinate: function(obj, lnglat, options) {
       /** Place the given object on the map, centered around the provided longitude and latitude
           The object's internal coordinates are assumed to be in meter-offset format, meaning
           1 unit represents 1 meter distance away from the provided coordinate.
       */

       if (options === undefined) options = {};
       if(options.preScale === undefined) options.preScale = 1.0;
       if(options.scaleToLatitude === undefined || obj.userData.scaleToLatitude) options.scaleToLatitude = true;

       obj.userData.scaleToLatitude = options.scaleToLatitude;

       if (typeof options.preScale === 'number') options.preScale = new THREE.Vector3(options.preScale, options.preScale, options.preScale);
       else if(options.preScale.constructor === Array && options.preScale.length === 3) options.preScale = new THREE.Vector3(options.preScale[0], options.preScale[1], options.preScale[2]);
       else if(options.preScale.constructor !== THREE.Vector3) {
           console.warn("Invalid preScale value: number, Array with length 3, or THREE.Vector3 expected. Defaulting to [1,1,1]");
           options.preScale = new THREE.Vector3(1,1,1);
       }

       var scale = options.preScale;

       // Figure out if this object is a geoGroup and should be positioned and scaled directly, or if its parent
       var geoGroup;
       if (obj.userData.isGeoGroup) geoGroup = obj;
       else if (obj.parent && obj.parent.userData.isGeoGroup) geoGroup = obj.parent;
       else return console.error("Cannot set geographic coordinates of object that does not have an associated GeoGroup. Object must be added to scene with 'addAtCoordinate()'.")

       if(options.scaleToLatitude) {
           // Scale the model so that its units are interpreted as meters at the given latitude
           var pixelsPerMeter = this.projectedUnitsPerMeter(lnglat[1]);
           scale.multiplyScalar(pixelsPerMeter);
       }

       geoGroup.scale.copy(scale);

       geoGroup.position.copy(this.projectToWorld(lnglat));
       obj.coordinates = lnglat;

       return obj;
   },

   projectedUnitsPerMeter: function(latitude) {
     // 纬度越高放大越多  threebox中的处理方式，why？？？？？？？
       // return Math.abs( 512 * ( 1 / Math.cos( latitude * Math.PI / 180 ) ) / 40075000 );
       return Math.abs( 512 * ( 1 / Math.cos( 45 * Math.PI / 180 ) ) / 40075000 );
       // 40075000是地球周长（单位米）
   },

   projectToWorld: function (coords){
       // Spherical mercator forward projection, re-scaling to WORLD_SIZE
       /*
       将经纬度转成webgl坐标，正好对应mapbox geo/transform的lngX、latY两个方法

            * latitude to absolute x coord
            * @returns {number} pixel coordinate

            lngX(lng: number) {
               return (180 + lng) * this.worldSize / 360;
            }

           * latitude to absolute y coord
           * @returns {number} pixel coordinate

            latY(lat: number) {
                const y = 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
                return (180 - y) * this.worldSize / 360;
            }
       */
       var projected = [
           -constants.MERCATOR_A * coords[0] * constants.DEG2RAD * constants.PROJECTION_WORLD_SIZE,
           -constants.MERCATOR_A * Math.log(Math.tan((Math.PI*0.25) + (0.5 * coords[1] * constants.DEG2RAD))) * constants.PROJECTION_WORLD_SIZE
       ];

       var pixelsPerMeter = this.projectedUnitsPerMeter(coords[1]);

       //z dimension
       var height = coords[2] || 0;
       projected.push( height * pixelsPerMeter );

       var result = new THREE.Vector3(projected[0], projected[1], projected[2]);

       return result;
   },

   getJSON: function() {

     /**
      * 生成一个XMLHttpRequest请求
      * @param  {Object} requestParameters 请求参数
      * @return {Object} 返回请求对象
      */
     function createRequest( requestParameters ) {
       var xhr = new window.XMLHttpRequest();
       xhr.open('GET', requestParameters.url, true);
       for (var k in requestParameters.headers) {
         xhr.setRequestHeader(k, requestParameters.headers[k]);
       }

       // 如果为true，则允许CORS请求发送cookie到服务器  详见 http://www.ruanyifeng.com/blog/2016/04/cors.html
       xhr.withCredentials = requestParameters.credentials === 'include';
       return xhr;
     }

     /**
      * 读取一个json文件
      * @param  {Object}   requestParameters 请求参数
      * @param  {Function} callback          回调函数
      * @return {[type]}                     [description]
      *
      * @example getJSON( { url:'./XXX.json' }, function( err, data ){ ... } )
      */
     return function( requestParameters, callback ) {

       var xhr = createRequest( requestParameters );
       xhr.setRequestHeader('Accept', 'application/json');
       xhr.onerror = function() {
         callback( new Error( xhr.statusText ) );
       };
       xhr.onload = function() {
          // 成功执行区域
          // 2XX表示有效响应
          // 304意味着是从缓存读取
         if ( xhr.status >= 200 && xhr.status < 300 && xhr.response ) { // 请求成功
           var data;
           try {
             data = JSON.parse( xhr.response );
           } catch ( err ) {
             return callback( err );
           }
           callback( null, data );
         } else { // 请求失败
           callback( new AJAXError( xhr.statusText, xhr.status ) );
         }
       };
       xhr.send();
       return xhr;
     }

   }(),



} )

/**
 * Ajax请求错误对象
 * @param       {string} message 关于错误的描述
 * @param       {number} status  响应状态码
 * @constructor
 */
function AJAXError( message, status ) {
  Error.call( this, message );
  this.status = status;
}

AJAXError.prototype = Object.create( Error.prototype );

module.exports = Layer;

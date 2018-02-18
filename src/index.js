var THREE = require( './lib/three.js' );
var constants = require( './constant.js' );
var LayerContainer = require( './layercontainer.js' );
var AutoCamera = require( './autocamera.js' );

/*
  MapboxWrapper:  mapboxgl.Map的包装类
  封装了使用threejs对mapboxgl.Map的操作
  @param map MapboxGL的Map对象

        ******实际上，所有的可视化绘制和mapboxgl的绘图上下文没有任何关系，因为根本就不在一个canvas里。
        两个canvas相当于两个图层，我们绘制的三维要素在上层的canvas里，地图在下层的canvas里，然后两者叠加在一起
        看了一下uber的deckgl，也是用了两个canvas，地图一个，三维要素一个
        而echarts-gl甚至用了三个canvas
*/
function MapboxWrapper( map ) {

  // 保存当前对象包装的Map实例的引用
  this.map = map;

  /********初始化自定义三维要素的绘图环境********/

  // 创建渲染器，开启透明绘制和抗锯齿。
  var renderer = this.renderer = new THREE.WebGLRenderer( { alpha: true, antialias: true } );
  // 设置画布尺寸
  // Map对象的transform属性中保存了大量与地图相关的信息，还有很多和Webgl相关的信息
  renderer.setSize( map.transform.width, map.transform.height ); // width和height记录了canvas的像素值
  // 当map大小改变的时候，renderer的canvas也跟着改变
  map.on( 'resize', function() {
    renderer.setSize( map.transform.width, map.transform.height );
  } )
  // 开启阴影贴图
  renderer.shadowMap.enabled = true;

  /*********将渲染器的canvas节点添加到Map的父节点下********/

  map._container.appendChild( renderer.domElement );
  // 修改样式使其覆盖在Map的canvas上
  renderer.domElement.style[ 'position' ] = 'relative';
  // 鼠标事件在传播（捕获、冒泡）过程中将无视renderer的canvas。
  // 如果想让这个canvas的子节点响应鼠标事件，单独设置子节点的pointer-events属性就可以了
  renderer.domElement.style[ 'pointer-events' ] = 'none';
  renderer.domElement.style[ 'z-index' ] = '999';

  /*****创建场景*****/

  this.scene = new THREE.Scene();
  // 自动同步map的平移、缩放变换（model矩阵）
  this.layerContainer = new LayerContainer( map ); // scene下的顶层根节点，所有绘制的three object3d都包含在其中
  this.scene.add( this.layerContainer );

  /********创建一个和mapboxgl的摄像机完全同步的摄像机*********/

  // 自动同步vp矩阵（视图矩阵和投影矩阵）
  this.camera = new AutoCamera( map );

  /********渲染场景*********/

  this.animate();

}

Object.assign( MapboxWrapper.prototype, {

  /*
    逐帧渲染
  */
  animate: function () {

    // 传入requestAnimationFrame内的函数的调用者是window，所以要确保这个函数在他的作用域链中能找到当前mapboxWrapper对象的引用
    var scope = this;
    requestAnimationFrame( function() { scope.animate() } );

    this.render();

  },

  /*
    渲染函数
  */
  render: function() {

    // 函数私有的变量

    var lastFrame, currentFrame; // 渲染上一帧的时间，渲染当前帧的时间（用于计算两帧间的时间差）

    return function() {
        this.renderer.render( this.scene, this.camera );
    }

  }(),

  /*
    在指定位置添加three要素
    @param obj:Mesh
    @param lnglat: Array 经纬度
    @param options: Object
  */
  addAtCoordinate: function(obj, lnglat, options) {
       var geoGroup = new THREE.Group();
       geoGroup.userData.isGeoGroup = true;
       geoGroup.add(obj);
       this.layerContainer.add(geoGroup);
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
       return Math.abs( 512 * ( 1 / Math.cos( latitude * Math.PI / 180 ) ) / 40075000 );
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

   /*
      添加柱状图层
      @param options:Object
   */
   addPillarLayer: function( options ) {

   }


} )


module.exports = MapboxWrapper;

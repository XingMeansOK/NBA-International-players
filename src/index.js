var THREE = require( './lib/three.js' );

var WORLD_SIZE = 512;
var MERCATOR_A = 6378137.0;

var ThreeboxConstants = {
    WORLD_SIZE: WORLD_SIZE,
    PROJECTION_WORLD_SIZE: WORLD_SIZE / (MERCATOR_A * Math.PI) / 2,
    MERCATOR_A: MERCATOR_A, // 900913 projection property 地球半径
    DEG2RAD: Math.PI / 180,
    RAD2DEG: 180 / Math.PI,
    EARTH_CIRCUMFERENCE: 40075000, // In meters
}

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
  this.world = new THREE.Group(); // 所有three绘制的根节点，同时也方便进行坐标变换
  this.scene.add( this.world );

  /********创建一个和mapboxgl的摄像机完全同步的摄像机*********/

  this.camera = new THREE.PerspectiveCamera( 90, map.transform.width / map.transform.height, 0.1, 10000 ); // 摄像机的初始化参数无所谓
  this.synchronizeCameras(); // 同步three.js摄像机和mapboxgl摄像机，这个函数调用之后两个摄像机将一直保持同步
  // this.cameraSynchronizer = new CameraSync(this.map, this.camera, this.world);
  /********渲染场景*********/

  this.animate();

}

Object.assign( MapboxWrapper.prototype, {

  /*
    同步three.js摄像机和mapboxgl摄像机，并保持同步
  */
  synchronizeCameras: function() {

    var map = this.map;
    var camera = this.camera;
    var world = this.world;
    var FOV = 0.6435011087932844; // 摄像机fovy，是个固定值
    var HALFFOV = FOV / 2; // 摄像机fovy的一半
    var TILESIZE = 512; // 对应mapbox的transform.tileSize; 瓦片的尺寸

    // 确保three摄像机和mapboxgl.map都绑定了
    if( !map || !camera ) return;

    // 设置为true时，每一帧都会重新计算matrix矩阵，并重新计算matrixWorld，这里要手动控制姿态，所以设置为false。
    camera.matrixAutoUpdate = false;
    // ??????????
    world.position.x = world.position.y = ThreeboxConstants.WORLD_SIZE / 2;
    world.matrixAutoUpdate = false;

     // 计算投影矩阵的函数 参数就是视锥上下截面夹角，宽高比，近截面，远截面
     // 返回一个THREE.Matrix4对象
    function _calcPerspectiveMatrix( fovy, aspect, near, far ) {
      var out = new THREE.Matrix4();
      var f = 1.0 / Math.tan( fovy / 2 ),
      nf = 1 / ( near - far );
      out.elements[0] = f / aspect;
      out.elements[1] = 0;
      out.elements[2] = 0;
      out.elements[3] = 0;
      out.elements[4] = 0;
      out.elements[5] = f;
      out.elements[6] = 0;
      out.elements[7] = 0;
      out.elements[8] = 0;
      out.elements[9] = 0;
      out.elements[10] = ( far + near ) * nf;
      out.elements[11] = -1;
      out.elements[12] = 0;
      out.elements[13] = 0;
      out.elements[14] = ( 2 * far * near ) * nf;
      out.elements[15] = 0;
      return out;
    }

    // 同步摄像机的函数，
    function _synchronizeCameras() {

      // mapboxgl的map有一个transform属性，是一个Transform类型的对象实例，其源码位于mapbox-gl-js/src/geo/transform.js
      // transform记录了摄像机的姿态，每次改变姿态都会调用transform._calcMatrices()方法
      // 来重新计算摄像机的矩阵

      // mapboxgl的摄像机运动规律：
      /*
        前提：map的canvas大小不变。
        视锥：视锥只有在摄像机与地图平面的倾角（map.transform.pitch）改变时，改变远截面的位置。其余都不变
        摄像机位置：摄像机相对世界坐标原点的距离始终不变，改变视线方向是使摄像机，绕x轴或z轴旋转（想象下手柄摇杆，手动挡那种）
        平移：移动的是地图，但是仅限于xy平面内。改变地图的全局变换矩阵
        缩放：改变的是地图，因为摄像机的距离和fov都没变。缩放的过程中还有地图的分级问题，我觉得是没用移动摄像机或者地图平面的原因
      */

      // 因为是同步mapboxgl的摄像机参数，所以就是重构transform._calcMatrices()方法

      /*****计算视锥******/

      // 摄像机到世界坐标原点的距离
      var cameraToCenterDistance = 0.5 / Math.tan( FOV / 2 ) * map.transform.height; // height是mapboxgl canvas的高度（pixel）

      /*
        只要窗口尺寸不变，canvas大小就不变，map.transform.height就不变
        至于为什么一个像素单位等于webgl世界坐标系中一个单位长度，_calcMatrices中有这样一句注释：
        1 Z unit is equivalent to 1 horizontal px at the center of the map
        (the distance between[width/2, height/2] and [width/2 + 1, height/2])

        1米单位长度与像素的换算关系为
        1米 = 屏幕分辨率的高/裁剪面的高 = h / (2*tan(HALFFOV)*z) = 1的话，所以z = h/(2*tan(HALFFOV))
        这样就保证了一个单位长度转换成了一个像素
      */


      var groundAngle = Math.PI / 2 + map.transform._pitch; // pitch只能绕x轴正方向旋转（右手定则），最大60度
      // 视锥上截面与xoy平面交线的中点到世界坐标原点的距离
      var topHalfSurfaceDistance = Math.sin( HALFFOV ) * cameraToCenterDistance / Math.sin( Math.PI - groundAngle - HALFFOV );
      // Calculate z distance of the farthest fragment that should be rendered.
      var furthestDistance = Math.cos( Math.PI / 2 - map.transform._pitch ) * topHalfSurfaceDistance + cameraToCenterDistance;
      // Add a bit extra to avoid precision problems when a fragment's distance is exactly `furthestDistance`
      var farZ = furthestDistance * 1.01; // 视锥远截面位置get

      // 计算投影矩阵
      camera.projectionMatrix = _calcPerspectiveMatrix( FOV, map.transform.width / map.transform.height, 1, farZ );

      /*****计算摄像机的姿态*****/

      // 参照threebox的代码，将投影矩阵和坐标变换分开
      var cameraWorldMatrix = new THREE.Matrix4();
      var cameraTranslateZ = new THREE.Matrix4().makeTranslation( 0, 0, cameraToCenterDistance );
      var cameraRotateX = new THREE.Matrix4().makeRotationX( map.transform._pitch );
      var cameraRotateZ = new THREE.Matrix4().makeRotationZ( map.transform.angle );

      // Unlike the Mapbox GL JS camera, separate camera translation and rotation out into its world matrix
      // If this is applied directly to the projection matrix, it will work OK but break raycasting
      cameraWorldMatrix
          .premultiply( cameraTranslateZ )
          .premultiply( cameraRotateX )
          .premultiply( cameraRotateZ )

      camera.matrixWorld.copy(cameraWorldMatrix); // 平移和缩放都不会改变这个矩阵，只有旋转会

      /*****计算three绘制的要素的变换矩阵，使其与地图的平移和缩放同步*****/

      // transform.scale = Math.pow(2, zoom)，2的zoom次幂。zoom是地图的缩放级别，0-22，可以是小数
      var zoomPow = map.transform.scale;
      var scale = new THREE.Matrix4();
      var translateCenter = new THREE.Matrix4();
      var translateMap = new THREE.Matrix4();
      var rotateMap = new THREE.Matrix4();

      scale.makeScale( zoomPow, zoomPow , zoomPow );
      translateCenter.makeTranslation( TILESIZE / 2, -TILESIZE / 2, 0 );
      translateMap.makeTranslation( -map.transform.x, map.transform.y, 0 );
      rotateMap.makeRotationZ( Math.PI );
      world.matrix = new THREE.Matrix4();
      world.matrix
          .premultiply( rotateMap )
          .premultiply( translateCenter )
          .premultiply( scale )
          .premultiply( translateMap )

          // world.matrixWorldNeedsUpdate = true;




    };

    // 地图从一个视图到另一个视图的转换过程中重复触发
    map.on( 'move', function() { _synchronizeCameras(); } );
    // 先同步一次
    _synchronizeCameras();
  },

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

  addAtCoordinate: function(obj, lnglat, options) {
       var geoGroup = new THREE.Group();
       geoGroup.userData.isGeoGroup = true;
       geoGroup.add(obj);
       // this._flipMaterialSides(obj);
       this.world.add(geoGroup);
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
           -ThreeboxConstants.MERCATOR_A * coords[0] * ThreeboxConstants.DEG2RAD * ThreeboxConstants.PROJECTION_WORLD_SIZE,
           -ThreeboxConstants.MERCATOR_A * Math.log(Math.tan((Math.PI*0.25) + (0.5 * coords[1] * ThreeboxConstants.DEG2RAD))) * ThreeboxConstants.PROJECTION_WORLD_SIZE
       ];

       var pixelsPerMeter = this.projectedUnitsPerMeter(coords[1]);

       //z dimension
       var height = coords[2] || 0;
       projected.push( height * pixelsPerMeter );

       var result = new THREE.Vector3(projected[0], projected[1], projected[2]);

       return result;
   },


} )


module.exports = MapboxWrapper;

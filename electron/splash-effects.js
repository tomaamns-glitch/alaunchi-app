"use strict";(()=>{function Pe(t){let e=t[0],i=t[1],r=t[2];return Math.sqrt(e*e+i*i+r*r)}function et(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t}function jt(t,e,i,r){return t[0]=e,t[1]=i,t[2]=r,t}function ft(t,e,i){return t[0]=e[0]+i[0],t[1]=e[1]+i[1],t[2]=e[2]+i[2],t}function dt(t,e,i){return t[0]=e[0]-i[0],t[1]=e[1]-i[1],t[2]=e[2]-i[2],t}function Zt(t,e,i){return t[0]=e[0]*i[0],t[1]=e[1]*i[1],t[2]=e[2]*i[2],t}function Yt(t,e,i){return t[0]=e[0]/i[0],t[1]=e[1]/i[1],t[2]=e[2]/i[2],t}function it(t,e,i){return t[0]=e[0]*i,t[1]=e[1]*i,t[2]=e[2]*i,t}function Qt(t,e){let i=e[0]-t[0],r=e[1]-t[1],s=e[2]-t[2];return Math.sqrt(i*i+r*r+s*s)}function Kt(t,e){let i=e[0]-t[0],r=e[1]-t[1],s=e[2]-t[2];return i*i+r*r+s*s}function pt(t){let e=t[0],i=t[1],r=t[2];return e*e+i*i+r*r}function Jt(t,e){return t[0]=-e[0],t[1]=-e[1],t[2]=-e[2],t}function ei(t,e){return t[0]=1/e[0],t[1]=1/e[1],t[2]=1/e[2],t}function tt(t,e){let i=e[0],r=e[1],s=e[2],n=i*i+r*r+s*s;return n>0&&(n=1/Math.sqrt(n)),t[0]=e[0]*n,t[1]=e[1]*n,t[2]=e[2]*n,t}function mt(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]}function gt(t,e,i){let r=e[0],s=e[1],n=e[2],a=i[0],o=i[1],l=i[2];return t[0]=s*l-n*o,t[1]=n*a-r*l,t[2]=r*o-s*a,t}function ti(t,e,i,r){let s=e[0],n=e[1],a=e[2];return t[0]=s+r*(i[0]-s),t[1]=n+r*(i[1]-n),t[2]=a+r*(i[2]-a),t}function ii(t,e,i,r,s){let n=Math.exp(-r*s),a=e[0],o=e[1],l=e[2];return t[0]=i[0]+(a-i[0])*n,t[1]=i[1]+(o-i[1])*n,t[2]=i[2]+(l-i[2])*n,t}function ri(t,e,i){let r=e[0],s=e[1],n=e[2],a=i[3]*r+i[7]*s+i[11]*n+i[15];return a=a||1,t[0]=(i[0]*r+i[4]*s+i[8]*n+i[12])/a,t[1]=(i[1]*r+i[5]*s+i[9]*n+i[13])/a,t[2]=(i[2]*r+i[6]*s+i[10]*n+i[14])/a,t}function si(t,e,i){let r=e[0],s=e[1],n=e[2],a=i[3]*r+i[7]*s+i[11]*n+i[15];return a=a||1,t[0]=(i[0]*r+i[4]*s+i[8]*n)/a,t[1]=(i[1]*r+i[5]*s+i[9]*n)/a,t[2]=(i[2]*r+i[6]*s+i[10]*n)/a,t}function ni(t,e,i){let r=e[0],s=e[1],n=e[2];return t[0]=r*i[0]+s*i[3]+n*i[6],t[1]=r*i[1]+s*i[4]+n*i[7],t[2]=r*i[2]+s*i[5]+n*i[8],t}function ai(t,e,i){let r=e[0],s=e[1],n=e[2],a=i[0],o=i[1],l=i[2],c=i[3],h=o*n-l*s,f=l*r-a*n,d=a*s-o*r,p=o*d-l*f,u=l*h-a*d,x=a*f-o*h,m=c*2;return h*=m,f*=m,d*=m,p*=2,u*=2,x*=2,t[0]=r+h+p,t[1]=s+f+u,t[2]=n+d+x,t}var li=(function(){let t=[0,0,0],e=[0,0,0];return function(i,r){et(t,i),et(e,r),tt(t,t),tt(e,e);let s=mt(t,e);return s>1?0:s<-1?Math.PI:Math.acos(s)}})();function oi(t,e){return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]}var le=class t extends Array{constructor(e=0,i=e,r=e){return super(e,i,r),this}get x(){return this[0]}get y(){return this[1]}get z(){return this[2]}set x(e){this[0]=e}set y(e){this[1]=e}set z(e){this[2]=e}set(e,i=e,r=e){return e.length?this.copy(e):(jt(this,e,i,r),this)}copy(e){return et(this,e),this}add(e,i){return i?ft(this,e,i):ft(this,this,e),this}sub(e,i){return i?dt(this,e,i):dt(this,this,e),this}multiply(e){return e.length?Zt(this,this,e):it(this,this,e),this}divide(e){return e.length?Yt(this,this,e):it(this,this,1/e),this}inverse(e=this){return ei(this,e),this}len(){return Pe(this)}distance(e){return e?Qt(this,e):Pe(this)}squaredLen(){return pt(this)}squaredDistance(e){return e?Kt(this,e):pt(this)}negate(e=this){return Jt(this,e),this}cross(e,i){return i?gt(this,e,i):gt(this,this,e),this}scale(e){return it(this,this,e),this}normalize(){return tt(this,this),this}dot(e){return mt(this,e)}equals(e){return oi(this,e)}applyMatrix3(e){return ni(this,this,e),this}applyMatrix4(e){return ri(this,this,e),this}scaleRotateMatrix4(e){return si(this,this,e),this}applyQuaternion(e){return ai(this,this,e),this}angle(e){return li(this,e)}lerp(e,i){return ti(this,this,e,i),this}smoothLerp(e,i,r){return ii(this,this,e,i,r),this}clone(){return new t(this[0],this[1],this[2])}fromArray(e,i=0){return this[0]=e[i],this[1]=e[i+1],this[2]=e[i+2],this}toArray(e=[],i=0){return e[i]=this[0],e[i+1]=this[1],e[i+2]=this[2],e}transformDirection(e){let i=this[0],r=this[1],s=this[2];return this[0]=e[0]*i+e[4]*r+e[8]*s,this[1]=e[1]*i+e[5]*r+e[9]*s,this[2]=e[2]*i+e[6]*r+e[10]*s,this.normalize()}};var ci=new le,Pr=1,Dr=1,ui=!1,De=class{constructor(e,i={}){e.canvas||console.error("gl not passed as first argument to Geometry"),this.gl=e,this.attributes=i,this.id=Pr++,this.VAOs={},this.drawRange={start:0,count:0},this.instancedCount=0,this.gl.renderer.bindVertexArray(null),this.gl.renderer.currentGeometry=null,this.glState=this.gl.renderer.state;for(let r in i)this.addAttribute(r,i[r])}addAttribute(e,i){if(this.attributes[e]=i,i.id=Dr++,i.size=i.size||1,i.type=i.type||(i.data.constructor===Float32Array?this.gl.FLOAT:i.data.constructor===Uint16Array?this.gl.UNSIGNED_SHORT:this.gl.UNSIGNED_INT),i.target=e==="index"?this.gl.ELEMENT_ARRAY_BUFFER:this.gl.ARRAY_BUFFER,i.normalized=i.normalized||!1,i.stride=i.stride||0,i.offset=i.offset||0,i.count=i.count||(i.stride?i.data.byteLength/i.stride:i.data.length/i.size),i.divisor=i.instanced||0,i.needsUpdate=!1,i.usage=i.usage||this.gl.STATIC_DRAW,i.buffer||this.updateAttribute(i),i.divisor){if(this.isInstanced=!0,this.instancedCount&&this.instancedCount!==i.count*i.divisor)return console.warn("geometry has multiple instanced buffers of different length"),this.instancedCount=Math.min(this.instancedCount,i.count*i.divisor);this.instancedCount=i.count*i.divisor}else e==="index"?this.drawRange.count=i.count:this.attributes.index||(this.drawRange.count=Math.max(this.drawRange.count,i.count))}updateAttribute(e){let i=!e.buffer;i&&(e.buffer=this.gl.createBuffer()),this.glState.boundBuffer!==e.buffer&&(this.gl.bindBuffer(e.target,e.buffer),this.glState.boundBuffer=e.buffer),i?this.gl.bufferData(e.target,e.data,e.usage):this.gl.bufferSubData(e.target,0,e.data),e.needsUpdate=!1}setIndex(e){this.addAttribute("index",e)}setDrawRange(e,i){this.drawRange.start=e,this.drawRange.count=i}setInstancedCount(e){this.instancedCount=e}createVAO(e){this.VAOs[e.attributeOrder]=this.gl.renderer.createVertexArray(),this.gl.renderer.bindVertexArray(this.VAOs[e.attributeOrder]),this.bindAttributes(e)}bindAttributes(e){e.attributeLocations.forEach((i,{name:r,type:s})=>{if(!this.attributes[r]){console.warn(`active attribute ${r} not being supplied`);return}let n=this.attributes[r];this.gl.bindBuffer(n.target,n.buffer),this.glState.boundBuffer=n.buffer;let a=1;s===35674&&(a=2),s===35675&&(a=3),s===35676&&(a=4);let o=n.size/a,l=a===1?0:a*a*4,c=a===1?0:a*4;for(let h=0;h<a;h++)this.gl.vertexAttribPointer(i+h,o,n.type,n.normalized,n.stride+l,n.offset+h*c),this.gl.enableVertexAttribArray(i+h),this.gl.renderer.vertexAttribDivisor(i+h,n.divisor)}),this.attributes.index&&this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER,this.attributes.index.buffer)}draw({program:e,mode:i=this.gl.TRIANGLES}){this.gl.renderer.currentGeometry!==`${this.id}_${e.attributeOrder}`&&(this.VAOs[e.attributeOrder]||this.createVAO(e),this.gl.renderer.bindVertexArray(this.VAOs[e.attributeOrder]),this.gl.renderer.currentGeometry=`${this.id}_${e.attributeOrder}`),e.attributeLocations.forEach((s,{name:n})=>{let a=this.attributes[n];a.needsUpdate&&this.updateAttribute(a)});let r=2;this.attributes.index?.type===this.gl.UNSIGNED_INT&&(r=4),this.isInstanced?this.attributes.index?this.gl.renderer.drawElementsInstanced(i,this.drawRange.count,this.attributes.index.type,this.attributes.index.offset+this.drawRange.start*r,this.instancedCount):this.gl.renderer.drawArraysInstanced(i,this.drawRange.start,this.drawRange.count,this.instancedCount):this.attributes.index?this.gl.drawElements(i,this.drawRange.count,this.attributes.index.type,this.attributes.index.offset+this.drawRange.start*r):this.gl.drawArrays(i,this.drawRange.start,this.drawRange.count)}getPosition(){let e=this.attributes.position;if(e.data)return e;if(!ui)return console.warn("No position buffer data found to compute bounds"),ui=!0}computeBoundingBox(e){e||(e=this.getPosition());let i=e.data,r=e.size;this.bounds||(this.bounds={min:new le,max:new le,center:new le,scale:new le,radius:1/0});let s=this.bounds.min,n=this.bounds.max,a=this.bounds.center,o=this.bounds.scale;s.set(1/0),n.set(-1/0);for(let l=0,c=i.length;l<c;l+=r){let h=i[l],f=i[l+1],d=i[l+2];s.x=Math.min(h,s.x),s.y=Math.min(f,s.y),s.z=Math.min(d,s.z),n.x=Math.max(h,n.x),n.y=Math.max(f,n.y),n.z=Math.max(d,n.z)}o.sub(n,s),a.add(s,n).divide(2)}computeBoundingSphere(e){e||(e=this.getPosition());let i=e.data,r=e.size;this.bounds||this.computeBoundingBox(e);let s=0;for(let n=0,a=i.length;n<a;n+=r)ci.fromArray(i,n),s=Math.max(s,this.bounds.center.squaredDistance(ci));this.bounds.radius=Math.sqrt(s)}remove(){for(let e in this.VAOs)this.gl.renderer.deleteVertexArray(this.VAOs[e]),delete this.VAOs[e];for(let e in this.attributes)this.gl.deleteBuffer(this.attributes[e].buffer),delete this.attributes[e]}};var Lr=1,fi={},ue=class{constructor(e,{vertex:i,fragment:r,uniforms:s={},transparent:n=!1,cullFace:a=e.BACK,frontFace:o=e.CCW,depthTest:l=!0,depthWrite:c=!0,depthFunc:h=e.LEQUAL}={}){e.canvas||console.error("gl not passed as first argument to Program"),this.gl=e,this.uniforms=s,this.id=Lr++,i||console.warn("vertex shader not supplied"),r||console.warn("fragment shader not supplied"),this.transparent=n,this.cullFace=a,this.frontFace=o,this.depthTest=l,this.depthWrite=c,this.depthFunc=h,this.blendFunc={},this.blendEquation={},this.stencilFunc={},this.stencilOp={},this.transparent&&!this.blendFunc.src&&(this.gl.renderer.premultipliedAlpha?this.setBlendFunc(this.gl.ONE,this.gl.ONE_MINUS_SRC_ALPHA):this.setBlendFunc(this.gl.SRC_ALPHA,this.gl.ONE_MINUS_SRC_ALPHA)),this.vertexShader=e.createShader(e.VERTEX_SHADER),this.fragmentShader=e.createShader(e.FRAGMENT_SHADER),this.program=e.createProgram(),e.attachShader(this.program,this.vertexShader),e.attachShader(this.program,this.fragmentShader),this.setShaders({vertex:i,fragment:r})}setShaders({vertex:e,fragment:i}){if(e&&(this.gl.shaderSource(this.vertexShader,e),this.gl.compileShader(this.vertexShader),this.gl.getShaderInfoLog(this.vertexShader)!==""&&console.warn(`${this.gl.getShaderInfoLog(this.vertexShader)}
Vertex Shader
${di(e)}`)),i&&(this.gl.shaderSource(this.fragmentShader,i),this.gl.compileShader(this.fragmentShader),this.gl.getShaderInfoLog(this.fragmentShader)!==""&&console.warn(`${this.gl.getShaderInfoLog(this.fragmentShader)}
Fragment Shader
${di(i)}`)),this.gl.linkProgram(this.program),!this.gl.getProgramParameter(this.program,this.gl.LINK_STATUS))return console.warn(this.gl.getProgramInfoLog(this.program));this.uniformLocations=new Map;let r=this.gl.getProgramParameter(this.program,this.gl.ACTIVE_UNIFORMS);for(let a=0;a<r;a++){let o=this.gl.getActiveUniform(this.program,a);this.uniformLocations.set(o,this.gl.getUniformLocation(this.program,o.name));let l=o.name.match(/(\w+)/g);o.uniformName=l[0],o.nameComponents=l.slice(1)}this.attributeLocations=new Map;let s=[],n=this.gl.getProgramParameter(this.program,this.gl.ACTIVE_ATTRIBUTES);for(let a=0;a<n;a++){let o=this.gl.getActiveAttrib(this.program,a),l=this.gl.getAttribLocation(this.program,o.name);l!==-1&&(s[l]=o.name,this.attributeLocations.set(o,l))}this.attributeOrder=s.join("")}setBlendFunc(e,i,r,s){this.blendFunc.src=e,this.blendFunc.dst=i,this.blendFunc.srcAlpha=r,this.blendFunc.dstAlpha=s,e&&(this.transparent=!0)}setBlendEquation(e,i){this.blendEquation.modeRGB=e,this.blendEquation.modeAlpha=i}setStencilFunc(e,i,r){this.stencilRef=i,this.stencilFunc.func=e,this.stencilFunc.ref=i,this.stencilFunc.mask=r}setStencilOp(e,i,r){this.stencilOp.stencilFail=e,this.stencilOp.depthFail=i,this.stencilOp.depthPass=r}applyState(){this.depthTest?this.gl.renderer.enable(this.gl.DEPTH_TEST):this.gl.renderer.disable(this.gl.DEPTH_TEST),this.cullFace?this.gl.renderer.enable(this.gl.CULL_FACE):this.gl.renderer.disable(this.gl.CULL_FACE),this.blendFunc.src?this.gl.renderer.enable(this.gl.BLEND):this.gl.renderer.disable(this.gl.BLEND),this.cullFace&&this.gl.renderer.setCullFace(this.cullFace),this.gl.renderer.setFrontFace(this.frontFace),this.gl.renderer.setDepthMask(this.depthWrite),this.gl.renderer.setDepthFunc(this.depthFunc),this.blendFunc.src&&this.gl.renderer.setBlendFunc(this.blendFunc.src,this.blendFunc.dst,this.blendFunc.srcAlpha,this.blendFunc.dstAlpha),this.gl.renderer.setBlendEquation(this.blendEquation.modeRGB,this.blendEquation.modeAlpha),this.stencilFunc.func||this.stencilOp.stencilFail?this.gl.renderer.enable(this.gl.STENCIL_TEST):this.gl.renderer.disable(this.gl.STENCIL_TEST),this.gl.renderer.setStencilFunc(this.stencilFunc.func,this.stencilFunc.ref,this.stencilFunc.mask),this.gl.renderer.setStencilOp(this.stencilOp.stencilFail,this.stencilOp.depthFail,this.stencilOp.depthPass)}use({flipFaces:e=!1}={}){let i=-1;this.gl.renderer.state.currentProgram===this.id||(this.gl.useProgram(this.program),this.gl.renderer.state.currentProgram=this.id),this.uniformLocations.forEach((s,n)=>{let a=this.uniforms[n.uniformName];for(let o of n.nameComponents){if(!a)break;if(o in a)a=a[o];else{if(Array.isArray(a.value))break;a=void 0;break}}if(!a)return pi(`Active uniform ${n.name} has not been supplied`);if(a&&a.value===void 0)return pi(`${n.name} uniform is missing a value parameter`);if(a.value.texture)return i=i+1,a.value.update(i),xt(this.gl,n.type,s,i);if(a.value.length&&a.value[0].texture){let o=[];return a.value.forEach(l=>{i=i+1,l.update(i),o.push(i)}),xt(this.gl,n.type,s,o)}xt(this.gl,n.type,s,a.value)}),this.applyState(),e&&this.gl.renderer.setFrontFace(this.frontFace===this.gl.CCW?this.gl.CW:this.gl.CCW)}remove(){this.gl.deleteProgram(this.program)}};function xt(t,e,i,r){r=r.length?Ur(r):r;let s=t.renderer.state.uniformLocations.get(i);if(r.length)if(s===void 0||s.length!==r.length)t.renderer.state.uniformLocations.set(i,r.slice(0));else{if(Or(s,r))return;s.set?s.set(r):Nr(s,r),t.renderer.state.uniformLocations.set(i,s)}else{if(s===r)return;t.renderer.state.uniformLocations.set(i,r)}switch(e){case 5126:return r.length?t.uniform1fv(i,r):t.uniform1f(i,r);case 35664:return t.uniform2fv(i,r);case 35665:return t.uniform3fv(i,r);case 35666:return t.uniform4fv(i,r);case 35670:case 5124:case 35678:case 36306:case 35680:case 36289:return r.length?t.uniform1iv(i,r):t.uniform1i(i,r);case 35671:case 35667:return t.uniform2iv(i,r);case 35672:case 35668:return t.uniform3iv(i,r);case 35673:case 35669:return t.uniform4iv(i,r);case 35674:return t.uniformMatrix2fv(i,!1,r);case 35675:return t.uniformMatrix3fv(i,!1,r);case 35676:return t.uniformMatrix4fv(i,!1,r)}}function di(t){let e=t.split(`
`);for(let i=0;i<e.length;i++)e[i]=i+1+": "+e[i];return e.join(`
`)}function Ur(t){let e=t.length,i=t[0].length;if(i===void 0)return t;let r=e*i,s=fi[r];s||(fi[r]=s=new Float32Array(r));for(let n=0;n<e;n++)s.set(t[n],n*i);return s}function Or(t,e){if(t.length!==e.length)return!1;for(let i=0,r=t.length;i<r;i++)if(t[i]!==e[i])return!1;return!0}function Nr(t,e){for(let i=0,r=t.length;i<r;i++)t[i]=e[i]}var vt=0;function pi(t){vt>100||(console.warn(t),vt++,vt>100&&console.warn("More than 100 program warnings - stopping logs."))}var wt=new le,Br=1,be=class{constructor({canvas:e=document.createElement("canvas"),width:i=300,height:r=150,dpr:s=1,alpha:n=!1,depth:a=!0,stencil:o=!1,antialias:l=!1,premultipliedAlpha:c=!1,preserveDrawingBuffer:h=!1,powerPreference:f="default",autoClear:d=!0,webgl:p=2}={}){let u={alpha:n,depth:a,stencil:o,antialias:l,premultipliedAlpha:c,preserveDrawingBuffer:h,powerPreference:f};this.dpr=s,this.alpha=n,this.color=!0,this.depth=a,this.stencil=o,this.premultipliedAlpha=c,this.autoClear=d,this.id=Br++,p===2&&(this.gl=e.getContext("webgl2",u)),this.isWebgl2=!!this.gl,this.gl||(this.gl=e.getContext("webgl",u)),this.gl||console.error("unable to create webgl context"),this.gl.renderer=this,this.setSize(i,r),this.state={},this.state.blendFunc={src:this.gl.ONE,dst:this.gl.ZERO},this.state.blendEquation={modeRGB:this.gl.FUNC_ADD},this.state.cullFace=!1,this.state.frontFace=this.gl.CCW,this.state.depthMask=!0,this.state.depthFunc=this.gl.LEQUAL,this.state.premultiplyAlpha=!1,this.state.flipY=!1,this.state.unpackAlignment=4,this.state.framebuffer=null,this.state.viewport={x:0,y:0,width:null,height:null},this.state.textureUnits=[],this.state.activeTextureUnit=0,this.state.boundBuffer=null,this.state.uniformLocations=new Map,this.state.currentProgram=null,this.extensions={},this.isWebgl2?(this.getExtension("EXT_color_buffer_float"),this.getExtension("OES_texture_float_linear")):(this.getExtension("OES_texture_float"),this.getExtension("OES_texture_float_linear"),this.getExtension("OES_texture_half_float"),this.getExtension("OES_texture_half_float_linear"),this.getExtension("OES_element_index_uint"),this.getExtension("OES_standard_derivatives"),this.getExtension("EXT_sRGB"),this.getExtension("WEBGL_depth_texture"),this.getExtension("WEBGL_draw_buffers")),this.getExtension("WEBGL_compressed_texture_astc"),this.getExtension("EXT_texture_compression_bptc"),this.getExtension("WEBGL_compressed_texture_s3tc"),this.getExtension("WEBGL_compressed_texture_etc1"),this.getExtension("WEBGL_compressed_texture_pvrtc"),this.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc"),this.vertexAttribDivisor=this.getExtension("ANGLE_instanced_arrays","vertexAttribDivisor","vertexAttribDivisorANGLE"),this.drawArraysInstanced=this.getExtension("ANGLE_instanced_arrays","drawArraysInstanced","drawArraysInstancedANGLE"),this.drawElementsInstanced=this.getExtension("ANGLE_instanced_arrays","drawElementsInstanced","drawElementsInstancedANGLE"),this.createVertexArray=this.getExtension("OES_vertex_array_object","createVertexArray","createVertexArrayOES"),this.bindVertexArray=this.getExtension("OES_vertex_array_object","bindVertexArray","bindVertexArrayOES"),this.deleteVertexArray=this.getExtension("OES_vertex_array_object","deleteVertexArray","deleteVertexArrayOES"),this.drawBuffers=this.getExtension("WEBGL_draw_buffers","drawBuffers","drawBuffersWEBGL"),this.parameters={},this.parameters.maxTextureUnits=this.gl.getParameter(this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),this.parameters.maxAnisotropy=this.getExtension("EXT_texture_filter_anisotropic")?this.gl.getParameter(this.getExtension("EXT_texture_filter_anisotropic").MAX_TEXTURE_MAX_ANISOTROPY_EXT):0}setSize(e,i){this.width=e,this.height=i,this.gl.canvas.width=e*this.dpr,this.gl.canvas.height=i*this.dpr,this.gl.canvas.style&&Object.assign(this.gl.canvas.style,{width:e+"px",height:i+"px"})}setViewport(e,i,r=0,s=0){this.state.viewport.width===e&&this.state.viewport.height===i||(this.state.viewport.width=e,this.state.viewport.height=i,this.state.viewport.x=r,this.state.viewport.y=s,this.gl.viewport(r,s,e,i))}setScissor(e,i,r=0,s=0){this.gl.scissor(r,s,e,i)}enable(e){this.state[e]!==!0&&(this.gl.enable(e),this.state[e]=!0)}disable(e){this.state[e]!==!1&&(this.gl.disable(e),this.state[e]=!1)}setBlendFunc(e,i,r,s){this.state.blendFunc.src===e&&this.state.blendFunc.dst===i&&this.state.blendFunc.srcAlpha===r&&this.state.blendFunc.dstAlpha===s||(this.state.blendFunc.src=e,this.state.blendFunc.dst=i,this.state.blendFunc.srcAlpha=r,this.state.blendFunc.dstAlpha=s,r!==void 0?this.gl.blendFuncSeparate(e,i,r,s):this.gl.blendFunc(e,i))}setBlendEquation(e,i){e=e||this.gl.FUNC_ADD,!(this.state.blendEquation.modeRGB===e&&this.state.blendEquation.modeAlpha===i)&&(this.state.blendEquation.modeRGB=e,this.state.blendEquation.modeAlpha=i,i!==void 0?this.gl.blendEquationSeparate(e,i):this.gl.blendEquation(e))}setCullFace(e){this.state.cullFace!==e&&(this.state.cullFace=e,this.gl.cullFace(e))}setFrontFace(e){this.state.frontFace!==e&&(this.state.frontFace=e,this.gl.frontFace(e))}setDepthMask(e){this.state.depthMask!==e&&(this.state.depthMask=e,this.gl.depthMask(e))}setDepthFunc(e){this.state.depthFunc!==e&&(this.state.depthFunc=e,this.gl.depthFunc(e))}setStencilMask(e){this.state.stencilMask!==e&&(this.state.stencilMask=e,this.gl.stencilMask(e))}setStencilFunc(e,i,r){this.state.stencilFunc===e&&this.state.stencilRef===i&&this.state.stencilFuncMask===r||(this.state.stencilFunc=e||this.gl.ALWAYS,this.state.stencilRef=i||0,this.state.stencilFuncMask=r||0,this.gl.stencilFunc(e||this.gl.ALWAYS,i||0,r||0))}setStencilOp(e,i,r){this.state.stencilFail===e&&this.state.stencilDepthFail===i&&this.state.stencilDepthPass===r||(this.state.stencilFail=e,this.state.stencilDepthFail=i,this.state.stencilDepthPass=r,this.gl.stencilOp(e,i,r))}activeTexture(e){this.state.activeTextureUnit!==e&&(this.state.activeTextureUnit=e,this.gl.activeTexture(this.gl.TEXTURE0+e))}bindFramebuffer({target:e=this.gl.FRAMEBUFFER,buffer:i=null}={}){this.state.framebuffer!==i&&(this.state.framebuffer=i,this.gl.bindFramebuffer(e,i))}getExtension(e,i,r){return i&&this.gl[i]?this.gl[i].bind(this.gl):(this.extensions[e]||(this.extensions[e]=this.gl.getExtension(e)),i?this.extensions[e]?this.extensions[e][r].bind(this.extensions[e]):null:this.extensions[e])}sortOpaque(e,i){return e.renderOrder!==i.renderOrder?e.renderOrder-i.renderOrder:e.program.id!==i.program.id?e.program.id-i.program.id:e.zDepth!==i.zDepth?e.zDepth-i.zDepth:i.id-e.id}sortTransparent(e,i){return e.renderOrder!==i.renderOrder?e.renderOrder-i.renderOrder:e.zDepth!==i.zDepth?i.zDepth-e.zDepth:i.id-e.id}sortUI(e,i){return e.renderOrder!==i.renderOrder?e.renderOrder-i.renderOrder:e.program.id!==i.program.id?e.program.id-i.program.id:i.id-e.id}getRenderList({scene:e,camera:i,frustumCull:r,sort:s}){let n=[];if(i&&r&&i.updateFrustum(),e.traverse(a=>{if(!a.visible)return!0;a.draw&&(r&&a.frustumCulled&&i&&!i.frustumIntersectsMesh(a)||n.push(a))}),s){let a=[],o=[],l=[];n.forEach(c=>{c.program.transparent?c.program.depthTest?o.push(c):l.push(c):a.push(c),c.zDepth=0,!(c.renderOrder!==0||!c.program.depthTest||!i)&&(c.worldMatrix.getTranslation(wt),wt.applyMatrix4(i.projectionViewMatrix),c.zDepth=wt.z)}),a.sort(this.sortOpaque),o.sort(this.sortTransparent),l.sort(this.sortUI),n=a.concat(o,l)}return n}render({scene:e,camera:i,target:r=null,update:s=!0,sort:n=!0,frustumCull:a=!0,clear:o}){r===null?(this.bindFramebuffer(),this.setViewport(this.width*this.dpr,this.height*this.dpr)):(this.bindFramebuffer(r),this.setViewport(r.width,r.height)),(o||this.autoClear&&o!==!1)&&(this.depth&&(!r||r.depth)&&(this.enable(this.gl.DEPTH_TEST),this.setDepthMask(!0)),(this.stencil||!r||r.stencil)&&(this.enable(this.gl.STENCIL_TEST),this.setStencilMask(255)),this.gl.clear((this.color?this.gl.COLOR_BUFFER_BIT:0)|(this.depth?this.gl.DEPTH_BUFFER_BIT:0)|(this.stencil?this.gl.STENCIL_BUFFER_BIT:0))),s&&e.updateMatrixWorld(),i&&i.updateMatrixWorld(),this.getRenderList({scene:e,camera:i,frustumCull:a,sort:n}).forEach(c=>{c.draw({camera:i})})}};function mi(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t}function gi(t,e,i,r,s){return t[0]=e,t[1]=i,t[2]=r,t[3]=s,t}function xi(t,e){let i=e[0],r=e[1],s=e[2],n=e[3],a=i*i+r*r+s*s+n*n;return a>0&&(a=1/Math.sqrt(a)),t[0]=i*a,t[1]=r*a,t[2]=s*a,t[3]=n*a,t}function vi(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]+t[3]*e[3]}function wi(t){return t[0]=0,t[1]=0,t[2]=0,t[3]=1,t}function yi(t,e,i){i=i*.5;let r=Math.sin(i);return t[0]=r*e[0],t[1]=r*e[1],t[2]=r*e[2],t[3]=Math.cos(i),t}function yt(t,e,i){let r=e[0],s=e[1],n=e[2],a=e[3],o=i[0],l=i[1],c=i[2],h=i[3];return t[0]=r*h+a*o+s*c-n*l,t[1]=s*h+a*l+n*o-r*c,t[2]=n*h+a*c+r*l-s*o,t[3]=a*h-r*o-s*l-n*c,t}function Mi(t,e,i){i*=.5;let r=e[0],s=e[1],n=e[2],a=e[3],o=Math.sin(i),l=Math.cos(i);return t[0]=r*l+a*o,t[1]=s*l+n*o,t[2]=n*l-s*o,t[3]=a*l-r*o,t}function Ei(t,e,i){i*=.5;let r=e[0],s=e[1],n=e[2],a=e[3],o=Math.sin(i),l=Math.cos(i);return t[0]=r*l-n*o,t[1]=s*l+a*o,t[2]=n*l+r*o,t[3]=a*l-s*o,t}function Fi(t,e,i){i*=.5;let r=e[0],s=e[1],n=e[2],a=e[3],o=Math.sin(i),l=Math.cos(i);return t[0]=r*l+s*o,t[1]=s*l-r*o,t[2]=n*l+a*o,t[3]=a*l-n*o,t}function bi(t,e,i,r){let s=e[0],n=e[1],a=e[2],o=e[3],l=i[0],c=i[1],h=i[2],f=i[3],d,p,u,x,m;return p=s*l+n*c+a*h+o*f,p<0&&(p=-p,l=-l,c=-c,h=-h,f=-f),1-p>1e-6?(d=Math.acos(p),u=Math.sin(d),x=Math.sin((1-r)*d)/u,m=Math.sin(r*d)/u):(x=1-r,m=r),t[0]=x*s+m*l,t[1]=x*n+m*c,t[2]=x*a+m*h,t[3]=x*o+m*f,t}function Ti(t,e){let i=e[0],r=e[1],s=e[2],n=e[3],a=i*i+r*r+s*s+n*n,o=a?1/a:0;return t[0]=-i*o,t[1]=-r*o,t[2]=-s*o,t[3]=n*o,t}function Si(t,e){return t[0]=-e[0],t[1]=-e[1],t[2]=-e[2],t[3]=e[3],t}function Ri(t,e){let i=e[0]+e[4]+e[8],r;if(i>0)r=Math.sqrt(i+1),t[3]=.5*r,r=.5/r,t[0]=(e[5]-e[7])*r,t[1]=(e[6]-e[2])*r,t[2]=(e[1]-e[3])*r;else{let s=0;e[4]>e[0]&&(s=1),e[8]>e[s*3+s]&&(s=2);let n=(s+1)%3,a=(s+2)%3;r=Math.sqrt(e[s*3+s]-e[n*3+n]-e[a*3+a]+1),t[s]=.5*r,r=.5/r,t[3]=(e[n*3+a]-e[a*3+n])*r,t[n]=(e[n*3+s]+e[s*3+n])*r,t[a]=(e[a*3+s]+e[s*3+a])*r}return t}function Ai(t,e,i="YXZ"){let r=Math.sin(e[0]*.5),s=Math.cos(e[0]*.5),n=Math.sin(e[1]*.5),a=Math.cos(e[1]*.5),o=Math.sin(e[2]*.5),l=Math.cos(e[2]*.5);return i==="XYZ"?(t[0]=r*a*l+s*n*o,t[1]=s*n*l-r*a*o,t[2]=s*a*o+r*n*l,t[3]=s*a*l-r*n*o):i==="YXZ"?(t[0]=r*a*l+s*n*o,t[1]=s*n*l-r*a*o,t[2]=s*a*o-r*n*l,t[3]=s*a*l+r*n*o):i==="ZXY"?(t[0]=r*a*l-s*n*o,t[1]=s*n*l+r*a*o,t[2]=s*a*o+r*n*l,t[3]=s*a*l-r*n*o):i==="ZYX"?(t[0]=r*a*l-s*n*o,t[1]=s*n*l+r*a*o,t[2]=s*a*o-r*n*l,t[3]=s*a*l+r*n*o):i==="YZX"?(t[0]=r*a*l+s*n*o,t[1]=s*n*l+r*a*o,t[2]=s*a*o-r*n*l,t[3]=s*a*l-r*n*o):i==="XZY"&&(t[0]=r*a*l-s*n*o,t[1]=s*n*l-r*a*o,t[2]=s*a*o+r*n*l,t[3]=s*a*l+r*n*o),t}var _i=mi,Ii=gi;var Ci=vi;var zi=xi;var rt=class extends Array{constructor(e=0,i=0,r=0,s=1){super(e,i,r,s),this.onChange=()=>{},this._target=this;let n=["0","1","2","3"];return new Proxy(this,{set(a,o){let l=Reflect.set(...arguments);return l&&n.includes(o)&&a.onChange(),l}})}get x(){return this[0]}get y(){return this[1]}get z(){return this[2]}get w(){return this[3]}set x(e){this._target[0]=e,this.onChange()}set y(e){this._target[1]=e,this.onChange()}set z(e){this._target[2]=e,this.onChange()}set w(e){this._target[3]=e,this.onChange()}identity(){return wi(this._target),this.onChange(),this}set(e,i,r,s){return e.length?this.copy(e):(Ii(this._target,e,i,r,s),this.onChange(),this)}rotateX(e){return Mi(this._target,this._target,e),this.onChange(),this}rotateY(e){return Ei(this._target,this._target,e),this.onChange(),this}rotateZ(e){return Fi(this._target,this._target,e),this.onChange(),this}inverse(e=this._target){return Ti(this._target,e),this.onChange(),this}conjugate(e=this._target){return Si(this._target,e),this.onChange(),this}copy(e){return _i(this._target,e),this.onChange(),this}normalize(e=this._target){return zi(this._target,e),this.onChange(),this}multiply(e,i){return i?yt(this._target,e,i):yt(this._target,this._target,e),this.onChange(),this}dot(e){return Ci(this._target,e)}fromMatrix3(e){return Ri(this._target,e),this.onChange(),this}fromEuler(e,i){return Ai(this._target,e,e.order),i||this.onChange(),this}fromAxisAngle(e,i){return yi(this._target,e,i),this.onChange(),this}slerp(e,i){return bi(this._target,this._target,e,i),this.onChange(),this}fromArray(e,i=0){return this._target[0]=e[i],this._target[1]=e[i+1],this._target[2]=e[i+2],this._target[3]=e[i+3],this.onChange(),this}toArray(e=[],i=0){return e[i]=this[0],e[i+1]=this[1],e[i+2]=this[2],e[i+3]=this[3],e}};var Vr=1e-6;function ki(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t}function Pi(t,e,i,r,s,n,a,o,l,c,h,f,d,p,u,x,m){return t[0]=e,t[1]=i,t[2]=r,t[3]=s,t[4]=n,t[5]=a,t[6]=o,t[7]=l,t[8]=c,t[9]=h,t[10]=f,t[11]=d,t[12]=p,t[13]=u,t[14]=x,t[15]=m,t}function Di(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function Li(t,e){let i=e[0],r=e[1],s=e[2],n=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],f=e[9],d=e[10],p=e[11],u=e[12],x=e[13],m=e[14],v=e[15],w=i*o-r*a,y=i*l-s*a,g=i*c-n*a,M=r*l-s*o,E=r*c-n*o,T=s*c-n*l,U=h*x-f*u,I=h*m-d*u,C=h*v-p*u,D=f*m-d*x,z=f*v-p*x,O=d*v-p*m,b=w*O-y*z+g*D+M*C-E*I+T*U;return b?(b=1/b,t[0]=(o*O-l*z+c*D)*b,t[1]=(s*z-r*O-n*D)*b,t[2]=(x*T-m*E+v*M)*b,t[3]=(d*E-f*T-p*M)*b,t[4]=(l*C-a*O-c*I)*b,t[5]=(i*O-s*C+n*I)*b,t[6]=(m*g-u*T-v*y)*b,t[7]=(h*T-d*g+p*y)*b,t[8]=(a*z-o*C+c*U)*b,t[9]=(r*C-i*z-n*U)*b,t[10]=(u*E-x*g+v*w)*b,t[11]=(f*g-h*E-p*w)*b,t[12]=(o*I-a*D-l*U)*b,t[13]=(i*D-r*I+s*U)*b,t[14]=(x*y-u*M-m*w)*b,t[15]=(h*M-f*y+d*w)*b,t):null}function Mt(t){let e=t[0],i=t[1],r=t[2],s=t[3],n=t[4],a=t[5],o=t[6],l=t[7],c=t[8],h=t[9],f=t[10],d=t[11],p=t[12],u=t[13],x=t[14],m=t[15],v=e*a-i*n,w=e*o-r*n,y=e*l-s*n,g=i*o-r*a,M=i*l-s*a,E=r*l-s*o,T=c*u-h*p,U=c*x-f*p,I=c*m-d*p,C=h*x-f*u,D=h*m-d*u,z=f*m-d*x;return v*z-w*D+y*C+g*I-M*U+E*T}function Et(t,e,i){let r=e[0],s=e[1],n=e[2],a=e[3],o=e[4],l=e[5],c=e[6],h=e[7],f=e[8],d=e[9],p=e[10],u=e[11],x=e[12],m=e[13],v=e[14],w=e[15],y=i[0],g=i[1],M=i[2],E=i[3];return t[0]=y*r+g*o+M*f+E*x,t[1]=y*s+g*l+M*d+E*m,t[2]=y*n+g*c+M*p+E*v,t[3]=y*a+g*h+M*u+E*w,y=i[4],g=i[5],M=i[6],E=i[7],t[4]=y*r+g*o+M*f+E*x,t[5]=y*s+g*l+M*d+E*m,t[6]=y*n+g*c+M*p+E*v,t[7]=y*a+g*h+M*u+E*w,y=i[8],g=i[9],M=i[10],E=i[11],t[8]=y*r+g*o+M*f+E*x,t[9]=y*s+g*l+M*d+E*m,t[10]=y*n+g*c+M*p+E*v,t[11]=y*a+g*h+M*u+E*w,y=i[12],g=i[13],M=i[14],E=i[15],t[12]=y*r+g*o+M*f+E*x,t[13]=y*s+g*l+M*d+E*m,t[14]=y*n+g*c+M*p+E*v,t[15]=y*a+g*h+M*u+E*w,t}function Ui(t,e,i){let r=i[0],s=i[1],n=i[2],a,o,l,c,h,f,d,p,u,x,m,v;return e===t?(t[12]=e[0]*r+e[4]*s+e[8]*n+e[12],t[13]=e[1]*r+e[5]*s+e[9]*n+e[13],t[14]=e[2]*r+e[6]*s+e[10]*n+e[14],t[15]=e[3]*r+e[7]*s+e[11]*n+e[15]):(a=e[0],o=e[1],l=e[2],c=e[3],h=e[4],f=e[5],d=e[6],p=e[7],u=e[8],x=e[9],m=e[10],v=e[11],t[0]=a,t[1]=o,t[2]=l,t[3]=c,t[4]=h,t[5]=f,t[6]=d,t[7]=p,t[8]=u,t[9]=x,t[10]=m,t[11]=v,t[12]=a*r+h*s+u*n+e[12],t[13]=o*r+f*s+x*n+e[13],t[14]=l*r+d*s+m*n+e[14],t[15]=c*r+p*s+v*n+e[15]),t}function Oi(t,e,i){let r=i[0],s=i[1],n=i[2];return t[0]=e[0]*r,t[1]=e[1]*r,t[2]=e[2]*r,t[3]=e[3]*r,t[4]=e[4]*s,t[5]=e[5]*s,t[6]=e[6]*s,t[7]=e[7]*s,t[8]=e[8]*n,t[9]=e[9]*n,t[10]=e[10]*n,t[11]=e[11]*n,t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t}function Ni(t,e,i,r){let s=r[0],n=r[1],a=r[2],o=Math.hypot(s,n,a),l,c,h,f,d,p,u,x,m,v,w,y,g,M,E,T,U,I,C,D,z,O,b,j;return Math.abs(o)<Vr?null:(o=1/o,s*=o,n*=o,a*=o,l=Math.sin(i),c=Math.cos(i),h=1-c,f=e[0],d=e[1],p=e[2],u=e[3],x=e[4],m=e[5],v=e[6],w=e[7],y=e[8],g=e[9],M=e[10],E=e[11],T=s*s*h+c,U=n*s*h+a*l,I=a*s*h-n*l,C=s*n*h-a*l,D=n*n*h+c,z=a*n*h+s*l,O=s*a*h+n*l,b=n*a*h-s*l,j=a*a*h+c,t[0]=f*T+x*U+y*I,t[1]=d*T+m*U+g*I,t[2]=p*T+v*U+M*I,t[3]=u*T+w*U+E*I,t[4]=f*C+x*D+y*z,t[5]=d*C+m*D+g*z,t[6]=p*C+v*D+M*z,t[7]=u*C+w*D+E*z,t[8]=f*O+x*b+y*j,t[9]=d*O+m*b+g*j,t[10]=p*O+v*b+M*j,t[11]=u*O+w*b+E*j,e!==t&&(t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t)}function Bi(t,e){return t[0]=e[12],t[1]=e[13],t[2]=e[14],t}function Ft(t,e){let i=e[0],r=e[1],s=e[2],n=e[4],a=e[5],o=e[6],l=e[8],c=e[9],h=e[10];return t[0]=Math.hypot(i,r,s),t[1]=Math.hypot(n,a,o),t[2]=Math.hypot(l,c,h),t}function Hi(t){let e=t[0],i=t[1],r=t[2],s=t[4],n=t[5],a=t[6],o=t[8],l=t[9],c=t[10],h=e*e+i*i+r*r,f=s*s+n*n+a*a,d=o*o+l*l+c*c;return Math.sqrt(Math.max(h,f,d))}var bt=(function(){let t=[1,1,1];return function(e,i){let r=t;Ft(r,i);let s=1/r[0],n=1/r[1],a=1/r[2],o=i[0]*s,l=i[1]*n,c=i[2]*a,h=i[4]*s,f=i[5]*n,d=i[6]*a,p=i[8]*s,u=i[9]*n,x=i[10]*a,m=o+f+x,v=0;return m>0?(v=Math.sqrt(m+1)*2,e[3]=.25*v,e[0]=(d-u)/v,e[1]=(p-c)/v,e[2]=(l-h)/v):o>f&&o>x?(v=Math.sqrt(1+o-f-x)*2,e[3]=(d-u)/v,e[0]=.25*v,e[1]=(l+h)/v,e[2]=(p+c)/v):f>x?(v=Math.sqrt(1+f-o-x)*2,e[3]=(p-c)/v,e[0]=(l+h)/v,e[1]=.25*v,e[2]=(d+u)/v):(v=Math.sqrt(1+x-o-f)*2,e[3]=(l-h)/v,e[0]=(p+c)/v,e[1]=(d+u)/v,e[2]=.25*v),e}})();function $i(t,e,i,r){let s=Pe([t[0],t[1],t[2]]),n=Pe([t[4],t[5],t[6]]),a=Pe([t[8],t[9],t[10]]);Mt(t)<0&&(s=-s),i[0]=t[12],i[1]=t[13],i[2]=t[14];let l=t.slice(),c=1/s,h=1/n,f=1/a;l[0]*=c,l[1]*=c,l[2]*=c,l[4]*=h,l[5]*=h,l[6]*=h,l[8]*=f,l[9]*=f,l[10]*=f,bt(e,l),r[0]=s,r[1]=n,r[2]=a}function Vi(t,e,i,r){let s=t,n=e[0],a=e[1],o=e[2],l=e[3],c=n+n,h=a+a,f=o+o,d=n*c,p=n*h,u=n*f,x=a*h,m=a*f,v=o*f,w=l*c,y=l*h,g=l*f,M=r[0],E=r[1],T=r[2];return s[0]=(1-(x+v))*M,s[1]=(p+g)*M,s[2]=(u-y)*M,s[3]=0,s[4]=(p-g)*E,s[5]=(1-(d+v))*E,s[6]=(m+w)*E,s[7]=0,s[8]=(u+y)*T,s[9]=(m-w)*T,s[10]=(1-(d+x))*T,s[11]=0,s[12]=i[0],s[13]=i[1],s[14]=i[2],s[15]=1,s}function Gi(t,e){let i=e[0],r=e[1],s=e[2],n=e[3],a=i+i,o=r+r,l=s+s,c=i*a,h=r*a,f=r*o,d=s*a,p=s*o,u=s*l,x=n*a,m=n*o,v=n*l;return t[0]=1-f-u,t[1]=h+v,t[2]=d-m,t[3]=0,t[4]=h-v,t[5]=1-c-u,t[6]=p+x,t[7]=0,t[8]=d+m,t[9]=p-x,t[10]=1-c-f,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function Wi(t,e,i,r,s){let n=1/Math.tan(e/2),a=1/(r-s);return t[0]=n/i,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=n,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=(s+r)*a,t[11]=-1,t[12]=0,t[13]=0,t[14]=2*s*r*a,t[15]=0,t}function qi(t,e,i,r,s,n,a){let o=1/(e-i),l=1/(r-s),c=1/(n-a);return t[0]=-2*o,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*l,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=2*c,t[11]=0,t[12]=(e+i)*o,t[13]=(s+r)*l,t[14]=(a+n)*c,t[15]=1,t}function Xi(t,e,i,r){let s=e[0],n=e[1],a=e[2],o=r[0],l=r[1],c=r[2],h=s-i[0],f=n-i[1],d=a-i[2],p=h*h+f*f+d*d;p===0?d=1:(p=1/Math.sqrt(p),h*=p,f*=p,d*=p);let u=l*d-c*f,x=c*h-o*d,m=o*f-l*h;return p=u*u+x*x+m*m,p===0&&(c?o+=1e-6:l?c+=1e-6:l+=1e-6,u=l*d-c*f,x=c*h-o*d,m=o*f-l*h,p=u*u+x*x+m*m),p=1/Math.sqrt(p),u*=p,x*=p,m*=p,t[0]=u,t[1]=x,t[2]=m,t[3]=0,t[4]=f*m-d*x,t[5]=d*u-h*m,t[6]=h*x-f*u,t[7]=0,t[8]=h,t[9]=f,t[10]=d,t[11]=0,t[12]=s,t[13]=n,t[14]=a,t[15]=1,t}function Tt(t,e,i){return t[0]=e[0]+i[0],t[1]=e[1]+i[1],t[2]=e[2]+i[2],t[3]=e[3]+i[3],t[4]=e[4]+i[4],t[5]=e[5]+i[5],t[6]=e[6]+i[6],t[7]=e[7]+i[7],t[8]=e[8]+i[8],t[9]=e[9]+i[9],t[10]=e[10]+i[10],t[11]=e[11]+i[11],t[12]=e[12]+i[12],t[13]=e[13]+i[13],t[14]=e[14]+i[14],t[15]=e[15]+i[15],t}function St(t,e,i){return t[0]=e[0]-i[0],t[1]=e[1]-i[1],t[2]=e[2]-i[2],t[3]=e[3]-i[3],t[4]=e[4]-i[4],t[5]=e[5]-i[5],t[6]=e[6]-i[6],t[7]=e[7]-i[7],t[8]=e[8]-i[8],t[9]=e[9]-i[9],t[10]=e[10]-i[10],t[11]=e[11]-i[11],t[12]=e[12]-i[12],t[13]=e[13]-i[13],t[14]=e[14]-i[14],t[15]=e[15]-i[15],t}function ji(t,e,i){return t[0]=e[0]*i,t[1]=e[1]*i,t[2]=e[2]*i,t[3]=e[3]*i,t[4]=e[4]*i,t[5]=e[5]*i,t[6]=e[6]*i,t[7]=e[7]*i,t[8]=e[8]*i,t[9]=e[9]*i,t[10]=e[10]*i,t[11]=e[11]*i,t[12]=e[12]*i,t[13]=e[13]*i,t[14]=e[14]*i,t[15]=e[15]*i,t}var Te=class extends Array{constructor(e=1,i=0,r=0,s=0,n=0,a=1,o=0,l=0,c=0,h=0,f=1,d=0,p=0,u=0,x=0,m=1){return super(e,i,r,s,n,a,o,l,c,h,f,d,p,u,x,m),this}get x(){return this[12]}get y(){return this[13]}get z(){return this[14]}get w(){return this[15]}set x(e){this[12]=e}set y(e){this[13]=e}set z(e){this[14]=e}set w(e){this[15]=e}set(e,i,r,s,n,a,o,l,c,h,f,d,p,u,x,m){return e.length?this.copy(e):(Pi(this,e,i,r,s,n,a,o,l,c,h,f,d,p,u,x,m),this)}translate(e,i=this){return Ui(this,i,e),this}rotate(e,i,r=this){return Ni(this,r,e,i),this}scale(e,i=this){return Oi(this,i,typeof e=="number"?[e,e,e]:e),this}add(e,i){return i?Tt(this,e,i):Tt(this,this,e),this}sub(e,i){return i?St(this,e,i):St(this,this,e),this}multiply(e,i){return e.length?i?Et(this,e,i):Et(this,this,e):ji(this,this,e),this}identity(){return Di(this),this}copy(e){return ki(this,e),this}fromPerspective({fov:e,aspect:i,near:r,far:s}={}){return Wi(this,e,i,r,s),this}fromOrthogonal({left:e,right:i,bottom:r,top:s,near:n,far:a}){return qi(this,e,i,r,s,n,a),this}fromQuaternion(e){return Gi(this,e),this}setPosition(e){return this.x=e[0],this.y=e[1],this.z=e[2],this}inverse(e=this){return Li(this,e),this}compose(e,i,r){return Vi(this,e,i,r),this}decompose(e,i,r){return $i(this,e,i,r),this}getRotation(e){return bt(e,this),this}getTranslation(e){return Bi(e,this),this}getScaling(e){return Ft(e,this),this}getMaxScaleOnAxis(){return Hi(this)}lookAt(e,i,r){return Xi(this,e,i,r),this}determinant(){return Mt(this)}fromArray(e,i=0){return this[0]=e[i],this[1]=e[i+1],this[2]=e[i+2],this[3]=e[i+3],this[4]=e[i+4],this[5]=e[i+5],this[6]=e[i+6],this[7]=e[i+7],this[8]=e[i+8],this[9]=e[i+9],this[10]=e[i+10],this[11]=e[i+11],this[12]=e[i+12],this[13]=e[i+13],this[14]=e[i+14],this[15]=e[i+15],this}toArray(e=[],i=0){return e[i]=this[0],e[i+1]=this[1],e[i+2]=this[2],e[i+3]=this[3],e[i+4]=this[4],e[i+5]=this[5],e[i+6]=this[6],e[i+7]=this[7],e[i+8]=this[8],e[i+9]=this[9],e[i+10]=this[10],e[i+11]=this[11],e[i+12]=this[12],e[i+13]=this[13],e[i+14]=this[14],e[i+15]=this[15],e}};function Zi(t,e,i="YXZ"){return i==="XYZ"?(t[1]=Math.asin(Math.min(Math.max(e[8],-1),1)),Math.abs(e[8])<.99999?(t[0]=Math.atan2(-e[9],e[10]),t[2]=Math.atan2(-e[4],e[0])):(t[0]=Math.atan2(e[6],e[5]),t[2]=0)):i==="YXZ"?(t[0]=Math.asin(-Math.min(Math.max(e[9],-1),1)),Math.abs(e[9])<.99999?(t[1]=Math.atan2(e[8],e[10]),t[2]=Math.atan2(e[1],e[5])):(t[1]=Math.atan2(-e[2],e[0]),t[2]=0)):i==="ZXY"?(t[0]=Math.asin(Math.min(Math.max(e[6],-1),1)),Math.abs(e[6])<.99999?(t[1]=Math.atan2(-e[2],e[10]),t[2]=Math.atan2(-e[4],e[5])):(t[1]=0,t[2]=Math.atan2(e[1],e[0]))):i==="ZYX"?(t[1]=Math.asin(-Math.min(Math.max(e[2],-1),1)),Math.abs(e[2])<.99999?(t[0]=Math.atan2(e[6],e[10]),t[2]=Math.atan2(e[1],e[0])):(t[0]=0,t[2]=Math.atan2(-e[4],e[5]))):i==="YZX"?(t[2]=Math.asin(Math.min(Math.max(e[1],-1),1)),Math.abs(e[1])<.99999?(t[0]=Math.atan2(-e[9],e[5]),t[1]=Math.atan2(-e[2],e[0])):(t[0]=0,t[1]=Math.atan2(e[8],e[10]))):i==="XZY"&&(t[2]=Math.asin(-Math.min(Math.max(e[4],-1),1)),Math.abs(e[4])<.99999?(t[0]=Math.atan2(e[6],e[5]),t[1]=Math.atan2(e[8],e[0])):(t[0]=Math.atan2(-e[9],e[10]),t[1]=0)),t}var Yi=new Te,st=class extends Array{constructor(e=0,i=e,r=e,s="YXZ"){super(e,i,r),this.order=s,this.onChange=()=>{},this._target=this;let n=["0","1","2"];return new Proxy(this,{set(a,o){let l=Reflect.set(...arguments);return l&&n.includes(o)&&a.onChange(),l}})}get x(){return this[0]}get y(){return this[1]}get z(){return this[2]}set x(e){this._target[0]=e,this.onChange()}set y(e){this._target[1]=e,this.onChange()}set z(e){this._target[2]=e,this.onChange()}set(e,i=e,r=e){return e.length?this.copy(e):(this._target[0]=e,this._target[1]=i,this._target[2]=r,this.onChange(),this)}copy(e){return this._target[0]=e[0],this._target[1]=e[1],this._target[2]=e[2],this.onChange(),this}reorder(e){return this._target.order=e,this.onChange(),this}fromRotationMatrix(e,i=this.order){return Zi(this._target,e,i),this.onChange(),this}fromQuaternion(e,i=this.order,r){return Yi.fromQuaternion(e),this._target.fromRotationMatrix(Yi,i),r||this.onChange(),this}fromArray(e,i=0){return this._target[0]=e[i],this._target[1]=e[i+1],this._target[2]=e[i+2],this}toArray(e=[],i=0){return e[i]=this[0],e[i+1]=this[1],e[i+2]=this[2],e}};var nt=class{constructor(){this.parent=null,this.children=[],this.visible=!0,this.matrix=new Te,this.worldMatrix=new Te,this.matrixAutoUpdate=!0,this.worldMatrixNeedsUpdate=!1,this.position=new le,this.quaternion=new rt,this.scale=new le(1),this.rotation=new st,this.up=new le(0,1,0),this.rotation._target.onChange=()=>this.quaternion.fromEuler(this.rotation,!0),this.quaternion._target.onChange=()=>this.rotation.fromQuaternion(this.quaternion,void 0,!0)}setParent(e,i=!0){this.parent&&e!==this.parent&&this.parent.removeChild(this,!1),this.parent=e,i&&e&&e.addChild(this,!1)}addChild(e,i=!0){~this.children.indexOf(e)||this.children.push(e),i&&e.setParent(this,!1)}removeChild(e,i=!0){~this.children.indexOf(e)&&this.children.splice(this.children.indexOf(e),1),i&&e.setParent(null,!1)}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.worldMatrixNeedsUpdate||e)&&(this.parent===null?this.worldMatrix.copy(this.matrix):this.worldMatrix.multiply(this.parent.worldMatrix,this.matrix),this.worldMatrixNeedsUpdate=!1,e=!0);for(let i=0,r=this.children.length;i<r;i++)this.children[i].updateMatrixWorld(e)}updateMatrix(){this.matrix.compose(this.quaternion,this.position,this.scale),this.worldMatrixNeedsUpdate=!0}traverse(e){if(!e(this))for(let i=0,r=this.children.length;i<r;i++)this.children[i].traverse(e)}decompose(){this.matrix.decompose(this.quaternion._target,this.position,this.scale),this.rotation.fromQuaternion(this.quaternion)}lookAt(e,i=!1){i?this.matrix.lookAt(this.position,e,this.up):this.matrix.lookAt(e,this.position,this.up),this.matrix.getRotation(this.quaternion._target),this.rotation.fromQuaternion(this.quaternion)}};function Qi(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[4],t[4]=e[5],t[5]=e[6],t[6]=e[8],t[7]=e[9],t[8]=e[10],t}function Ki(t,e){let i=e[0],r=e[1],s=e[2],n=e[3],a=i+i,o=r+r,l=s+s,c=i*a,h=r*a,f=r*o,d=s*a,p=s*o,u=s*l,x=n*a,m=n*o,v=n*l;return t[0]=1-f-u,t[3]=h-v,t[6]=d+m,t[1]=h+v,t[4]=1-c-u,t[7]=p-x,t[2]=d-m,t[5]=p+x,t[8]=1-c-f,t}function Ji(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t}function er(t,e,i,r,s,n,a,o,l,c){return t[0]=e,t[1]=i,t[2]=r,t[3]=s,t[4]=n,t[5]=a,t[6]=o,t[7]=l,t[8]=c,t}function tr(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=1,t[5]=0,t[6]=0,t[7]=0,t[8]=1,t}function ir(t,e){let i=e[0],r=e[1],s=e[2],n=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],f=h*a-o*c,d=-h*n+o*l,p=c*n-a*l,u=i*f+r*d+s*p;return u?(u=1/u,t[0]=f*u,t[1]=(-h*r+s*c)*u,t[2]=(o*r-s*a)*u,t[3]=d*u,t[4]=(h*i-s*l)*u,t[5]=(-o*i+s*n)*u,t[6]=p*u,t[7]=(-c*i+r*l)*u,t[8]=(a*i-r*n)*u,t):null}function Rt(t,e,i){let r=e[0],s=e[1],n=e[2],a=e[3],o=e[4],l=e[5],c=e[6],h=e[7],f=e[8],d=i[0],p=i[1],u=i[2],x=i[3],m=i[4],v=i[5],w=i[6],y=i[7],g=i[8];return t[0]=d*r+p*a+u*c,t[1]=d*s+p*o+u*h,t[2]=d*n+p*l+u*f,t[3]=x*r+m*a+v*c,t[4]=x*s+m*o+v*h,t[5]=x*n+m*l+v*f,t[6]=w*r+y*a+g*c,t[7]=w*s+y*o+g*h,t[8]=w*n+y*l+g*f,t}function rr(t,e,i){let r=e[0],s=e[1],n=e[2],a=e[3],o=e[4],l=e[5],c=e[6],h=e[7],f=e[8],d=i[0],p=i[1];return t[0]=r,t[1]=s,t[2]=n,t[3]=a,t[4]=o,t[5]=l,t[6]=d*r+p*a+c,t[7]=d*s+p*o+h,t[8]=d*n+p*l+f,t}function sr(t,e,i){let r=e[0],s=e[1],n=e[2],a=e[3],o=e[4],l=e[5],c=e[6],h=e[7],f=e[8],d=Math.sin(i),p=Math.cos(i);return t[0]=p*r+d*a,t[1]=p*s+d*o,t[2]=p*n+d*l,t[3]=p*a-d*r,t[4]=p*o-d*s,t[5]=p*l-d*n,t[6]=c,t[7]=h,t[8]=f,t}function nr(t,e,i){let r=i[0],s=i[1];return t[0]=r*e[0],t[1]=r*e[1],t[2]=r*e[2],t[3]=s*e[3],t[4]=s*e[4],t[5]=s*e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t}function ar(t,e){let i=e[0],r=e[1],s=e[2],n=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],f=e[9],d=e[10],p=e[11],u=e[12],x=e[13],m=e[14],v=e[15],w=i*o-r*a,y=i*l-s*a,g=i*c-n*a,M=r*l-s*o,E=r*c-n*o,T=s*c-n*l,U=h*x-f*u,I=h*m-d*u,C=h*v-p*u,D=f*m-d*x,z=f*v-p*x,O=d*v-p*m,b=w*O-y*z+g*D+M*C-E*I+T*U;return b?(b=1/b,t[0]=(o*O-l*z+c*D)*b,t[1]=(l*C-a*O-c*I)*b,t[2]=(a*z-o*C+c*U)*b,t[3]=(s*z-r*O-n*D)*b,t[4]=(i*O-s*C+n*I)*b,t[5]=(r*C-i*z-n*U)*b,t[6]=(x*T-m*E+v*M)*b,t[7]=(m*g-u*T-v*y)*b,t[8]=(u*E-x*g+v*w)*b,t):null}var at=class extends Array{constructor(e=1,i=0,r=0,s=0,n=1,a=0,o=0,l=0,c=1){return super(e,i,r,s,n,a,o,l,c),this}set(e,i,r,s,n,a,o,l,c){return e.length?this.copy(e):(er(this,e,i,r,s,n,a,o,l,c),this)}translate(e,i=this){return rr(this,i,e),this}rotate(e,i=this){return sr(this,i,e),this}scale(e,i=this){return nr(this,i,e),this}multiply(e,i){return i?Rt(this,e,i):Rt(this,this,e),this}identity(){return tr(this),this}copy(e){return Ji(this,e),this}fromMatrix4(e){return Qi(this,e),this}fromQuaternion(e){return Ki(this,e),this}fromBasis(e,i,r){return this.set(e[0],e[1],e[2],i[0],i[1],i[2],r[0],r[1],r[2]),this}inverse(e=this){return ir(this,e),this}getNormalMatrix(e){return ar(this,e),this}};var Xr=0,fe=class extends nt{constructor(e,{geometry:i,program:r,mode:s=e.TRIANGLES,frustumCulled:n=!0,renderOrder:a=0}={}){super(),e.canvas||console.error("gl not passed as first argument to Mesh"),this.gl=e,this.id=Xr++,this.geometry=i,this.program=r,this.mode=s,this.frustumCulled=n,this.renderOrder=a,this.modelViewMatrix=new Te,this.normalMatrix=new at,this.beforeRenderCallbacks=[],this.afterRenderCallbacks=[]}onBeforeRender(e){return this.beforeRenderCallbacks.push(e),this}onAfterRender(e){return this.afterRenderCallbacks.push(e),this}draw({camera:e}={}){e&&(this.program.uniforms.modelMatrix||Object.assign(this.program.uniforms,{modelMatrix:{value:null},viewMatrix:{value:null},modelViewMatrix:{value:null},normalMatrix:{value:null},projectionMatrix:{value:null},cameraPosition:{value:null}}),this.program.uniforms.projectionMatrix.value=e.projectionMatrix,this.program.uniforms.cameraPosition.value=e.worldPosition,this.program.uniforms.viewMatrix.value=e.viewMatrix,this.modelViewMatrix.multiply(e.viewMatrix,this.worldMatrix),this.normalMatrix.getNormalMatrix(this.modelViewMatrix),this.program.uniforms.modelMatrix.value=this.worldMatrix,this.program.uniforms.modelViewMatrix.value=this.modelViewMatrix,this.program.uniforms.normalMatrix.value=this.normalMatrix),this.beforeRenderCallbacks.forEach(r=>r&&r({mesh:this,camera:e}));let i=this.program.cullFace&&this.worldMatrix.determinant()<0;this.program.use({flipFaces:i}),this.geometry.draw({mode:this.mode,program:this.program}),this.afterRenderCallbacks.forEach(r=>r&&r({mesh:this,camera:e}))}};var lr=new Uint8Array(4);function or(t){return(t&t-1)===0}var jr=1,de=class{constructor(e,{image:i,target:r=e.TEXTURE_2D,type:s=e.UNSIGNED_BYTE,format:n=e.RGBA,internalFormat:a=n,wrapS:o=e.CLAMP_TO_EDGE,wrapT:l=e.CLAMP_TO_EDGE,wrapR:c=e.CLAMP_TO_EDGE,generateMipmaps:h=r===(e.TEXTURE_2D||e.TEXTURE_CUBE_MAP),minFilter:f=h?e.NEAREST_MIPMAP_LINEAR:e.LINEAR,magFilter:d=e.LINEAR,premultiplyAlpha:p=!1,unpackAlignment:u=4,flipY:x=r==(e.TEXTURE_2D||e.TEXTURE_3D),anisotropy:m=0,level:v=0,width:w,height:y=w,length:g=1}={}){this.gl=e,this.id=jr++,this.image=i,this.target=r,this.type=s,this.format=n,this.internalFormat=a,this.minFilter=f,this.magFilter=d,this.wrapS=o,this.wrapT=l,this.wrapR=c,this.generateMipmaps=h,this.premultiplyAlpha=p,this.unpackAlignment=u,this.flipY=x,this.anisotropy=Math.min(m,this.gl.renderer.parameters.maxAnisotropy),this.level=v,this.width=w,this.height=y,this.length=g,this.texture=this.gl.createTexture(),this.store={image:null},this.glState=this.gl.renderer.state,this.state={},this.state.minFilter=this.gl.NEAREST_MIPMAP_LINEAR,this.state.magFilter=this.gl.LINEAR,this.state.wrapS=this.gl.REPEAT,this.state.wrapT=this.gl.REPEAT,this.state.anisotropy=0}bind(){this.glState.textureUnits[this.glState.activeTextureUnit]!==this.id&&(this.gl.bindTexture(this.target,this.texture),this.glState.textureUnits[this.glState.activeTextureUnit]=this.id)}update(e=0){let i=!(this.image===this.store.image&&!this.needsUpdate);if((i||this.glState.textureUnits[e]!==this.id)&&(this.gl.renderer.activeTexture(e),this.bind()),!!i){if(this.needsUpdate=!1,this.flipY!==this.glState.flipY&&(this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL,this.flipY),this.glState.flipY=this.flipY),this.premultiplyAlpha!==this.glState.premultiplyAlpha&&(this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,this.premultiplyAlpha),this.glState.premultiplyAlpha=this.premultiplyAlpha),this.unpackAlignment!==this.glState.unpackAlignment&&(this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT,this.unpackAlignment),this.glState.unpackAlignment=this.unpackAlignment),this.minFilter!==this.state.minFilter&&(this.gl.texParameteri(this.target,this.gl.TEXTURE_MIN_FILTER,this.minFilter),this.state.minFilter=this.minFilter),this.magFilter!==this.state.magFilter&&(this.gl.texParameteri(this.target,this.gl.TEXTURE_MAG_FILTER,this.magFilter),this.state.magFilter=this.magFilter),this.wrapS!==this.state.wrapS&&(this.gl.texParameteri(this.target,this.gl.TEXTURE_WRAP_S,this.wrapS),this.state.wrapS=this.wrapS),this.wrapT!==this.state.wrapT&&(this.gl.texParameteri(this.target,this.gl.TEXTURE_WRAP_T,this.wrapT),this.state.wrapT=this.wrapT),this.wrapR!==this.state.wrapR&&(this.gl.texParameteri(this.target,this.gl.TEXTURE_WRAP_R,this.wrapR),this.state.wrapR=this.wrapR),this.anisotropy&&this.anisotropy!==this.state.anisotropy&&(this.gl.texParameterf(this.target,this.gl.renderer.getExtension("EXT_texture_filter_anisotropic").TEXTURE_MAX_ANISOTROPY_EXT,this.anisotropy),this.state.anisotropy=this.anisotropy),this.image){if(this.image.width&&(this.width=this.image.width,this.height=this.image.height),this.target===this.gl.TEXTURE_CUBE_MAP)for(let r=0;r<6;r++)this.gl.texImage2D(this.gl.TEXTURE_CUBE_MAP_POSITIVE_X+r,this.level,this.internalFormat,this.format,this.type,this.image[r]);else if(ArrayBuffer.isView(this.image))this.target===this.gl.TEXTURE_2D?this.gl.texImage2D(this.target,this.level,this.internalFormat,this.width,this.height,0,this.format,this.type,this.image):(this.target===this.gl.TEXTURE_2D_ARRAY||this.target===this.gl.TEXTURE_3D)&&this.gl.texImage3D(this.target,this.level,this.internalFormat,this.width,this.height,this.length,0,this.format,this.type,this.image);else if(this.image.isCompressedTexture)for(let r=0;r<this.image.length;r++)this.gl.compressedTexImage2D(this.target,r,this.internalFormat,this.image[r].width,this.image[r].height,0,this.image[r].data);else this.target===this.gl.TEXTURE_2D?this.gl.texImage2D(this.target,this.level,this.internalFormat,this.format,this.type,this.image):this.gl.texImage3D(this.target,this.level,this.internalFormat,this.width,this.height,this.length,0,this.format,this.type,this.image);this.generateMipmaps&&(!this.gl.renderer.isWebgl2&&(!or(this.image.width)||!or(this.image.height))?(this.generateMipmaps=!1,this.wrapS=this.wrapT=this.gl.CLAMP_TO_EDGE,this.minFilter=this.gl.LINEAR):this.gl.generateMipmap(this.target)),this.onUpdate&&this.onUpdate()}else if(this.target===this.gl.TEXTURE_CUBE_MAP)for(let r=0;r<6;r++)this.gl.texImage2D(this.gl.TEXTURE_CUBE_MAP_POSITIVE_X+r,0,this.gl.RGBA,1,1,0,this.gl.RGBA,this.gl.UNSIGNED_BYTE,lr);else this.width?this.target===this.gl.TEXTURE_2D?this.gl.texImage2D(this.target,this.level,this.internalFormat,this.width,this.height,0,this.format,this.type,null):this.gl.texImage3D(this.target,this.level,this.internalFormat,this.width,this.height,this.length,0,this.format,this.type,null):this.gl.texImage2D(this.target,0,this.gl.RGBA,1,1,0,this.gl.RGBA,this.gl.UNSIGNED_BYTE,lr);this.store.image=this.image}}};var He=class{constructor(e,{width:i=e.canvas.width,height:r=e.canvas.height,target:s=e.FRAMEBUFFER,color:n=1,depth:a=!0,stencil:o=!1,depthTexture:l=!1,wrapS:c=e.CLAMP_TO_EDGE,wrapT:h=e.CLAMP_TO_EDGE,wrapR:f=e.CLAMP_TO_EDGE,minFilter:d=e.LINEAR,magFilter:p=d,type:u=e.UNSIGNED_BYTE,format:x=e.RGBA,internalFormat:m=x,unpackAlignment:v,premultiplyAlpha:w}={}){this.gl=e,this.width=i,this.height=r,this.depth=a,this.stencil=o,this.buffer=this.gl.createFramebuffer(),this.target=s,this.gl.renderer.bindFramebuffer(this),this.textures=[];let y=[];for(let g=0;g<n;g++)this.textures.push(new de(e,{width:i,height:r,wrapS:c,wrapT:h,wrapR:f,minFilter:d,magFilter:p,type:u,format:x,internalFormat:m,unpackAlignment:v,premultiplyAlpha:w,flipY:!1,generateMipmaps:!1})),this.textures[g].update(),this.gl.framebufferTexture2D(this.target,this.gl.COLOR_ATTACHMENT0+g,this.gl.TEXTURE_2D,this.textures[g].texture,0),y.push(this.gl.COLOR_ATTACHMENT0+g);y.length>1&&this.gl.renderer.drawBuffers(y),this.texture=this.textures[0],l&&(this.gl.renderer.isWebgl2||this.gl.renderer.getExtension("WEBGL_depth_texture"))?(this.depthTexture=new de(e,{width:i,height:r,minFilter:this.gl.NEAREST,magFilter:this.gl.NEAREST,format:this.stencil?this.gl.DEPTH_STENCIL:this.gl.DEPTH_COMPONENT,internalFormat:e.renderer.isWebgl2?this.stencil?this.gl.DEPTH24_STENCIL8:this.gl.DEPTH_COMPONENT16:this.gl.DEPTH_COMPONENT,type:this.stencil?this.gl.UNSIGNED_INT_24_8:this.gl.UNSIGNED_INT}),this.depthTexture.update(),this.gl.framebufferTexture2D(this.target,this.stencil?this.gl.DEPTH_STENCIL_ATTACHMENT:this.gl.DEPTH_ATTACHMENT,this.gl.TEXTURE_2D,this.depthTexture.texture,0)):(a&&!o&&(this.depthBuffer=this.gl.createRenderbuffer(),this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,this.depthBuffer),this.gl.renderbufferStorage(this.gl.RENDERBUFFER,this.gl.DEPTH_COMPONENT16,i,r),this.gl.framebufferRenderbuffer(this.target,this.gl.DEPTH_ATTACHMENT,this.gl.RENDERBUFFER,this.depthBuffer)),o&&!a&&(this.stencilBuffer=this.gl.createRenderbuffer(),this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,this.stencilBuffer),this.gl.renderbufferStorage(this.gl.RENDERBUFFER,this.gl.STENCIL_INDEX8,i,r),this.gl.framebufferRenderbuffer(this.target,this.gl.STENCIL_ATTACHMENT,this.gl.RENDERBUFFER,this.stencilBuffer)),a&&o&&(this.depthStencilBuffer=this.gl.createRenderbuffer(),this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,this.depthStencilBuffer),this.gl.renderbufferStorage(this.gl.RENDERBUFFER,this.gl.DEPTH_STENCIL,i,r),this.gl.framebufferRenderbuffer(this.target,this.gl.DEPTH_STENCIL_ATTACHMENT,this.gl.RENDERBUFFER,this.depthStencilBuffer))),this.gl.renderer.bindFramebuffer({target:this.target})}setSize(e,i){if(!(this.width===e&&this.height===i)){this.width=e,this.height=i,this.gl.renderer.bindFramebuffer(this);for(let r=0;r<this.textures.length;r++)this.textures[r].width=e,this.textures[r].height=i,this.textures[r].needsUpdate=!0,this.textures[r].update(),this.gl.framebufferTexture2D(this.target,this.gl.COLOR_ATTACHMENT0+r,this.gl.TEXTURE_2D,this.textures[r].texture,0);this.depthTexture?(this.depthTexture.width=e,this.depthTexture.height=i,this.depthTexture.needsUpdate=!0,this.depthTexture.update(),this.gl.framebufferTexture2D(this.target,this.gl.DEPTH_ATTACHMENT,this.gl.TEXTURE_2D,this.depthTexture.texture,0)):(this.depthBuffer&&(this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,this.depthBuffer),this.gl.renderbufferStorage(this.gl.RENDERBUFFER,this.gl.DEPTH_COMPONENT16,e,i)),this.stencilBuffer&&(this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,this.stencilBuffer),this.gl.renderbufferStorage(this.gl.RENDERBUFFER,this.gl.STENCIL_INDEX8,e,i)),this.depthStencilBuffer&&(this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,this.depthStencilBuffer),this.gl.renderbufferStorage(this.gl.RENDERBUFFER,this.gl.DEPTH_STENCIL,e,i))),this.gl.renderer.bindFramebuffer({target:this.target})}}};var Se=class extends De{constructor(e,{attributes:i={}}={}){Object.assign(i,{position:{size:2,data:new Float32Array([-1,-1,3,-1,-1,3])},uv:{size:2,data:new Float32Array([0,0,2,0,0,2])}}),super(e,i)}};var hr={plasma:{color:"#F25BD0",strands:6,crackle:.85,flares:.65,glow:.9,sparks:.6,particleCount:15e3,fill:.5,motion:"rise",particleShape:"square",depth:.6,sway:.5,twinkle:.5,haze:.7,dustSpeed:1},aurora:{color:"#5CFFC8",strands:5,crackle:.6,flares:.5,glow:.8,sparks:.45,particleCount:15e3,fill:.5,motion:"rise",particleShape:"square",depth:.6,sway:.5,twinkle:.5,haze:.7,dustSpeed:1},nebula:{color:"#9478FF",strands:6,crackle:1,flares:.5,glow:.9,sparks:.6,particleCount:18e3,fill:.45,motion:"rise",particleShape:"square",depth:.5,sway:.4,twinkle:.6,haze:.8,dustSpeed:1.2},ember:{color:"#FF8A2A",strands:5,crackle:.9,flares:.8,glow:1,sparks:.8,particleCount:12e3,fill:.35,motion:"rise",particleShape:"round",depth:.7,sway:.3,twinkle:.7,haze:.9,dustSpeed:1.6},frost:{color:"#BFE6FF",strands:3,crackle:.3,flares:.3,glow:.6,sparks:.2,particleCount:16e3,fill:.6,motion:"fall",particleShape:"round",depth:.8,sway:.4,twinkle:.4,haze:.5,dustSpeed:.7},solar:{color:"#FFD36E",strands:6,crackle:.7,flares:1,glow:1.1,sparks:.5,particleCount:15e3,fill:.55,motion:"orbit",particleShape:"square",depth:.6,sway:.7,twinkle:.5,haze:.8,dustSpeed:1},eclipse:{color:"#FFFFFF",strands:4,crackle:.5,flares:.4,glow:.7,sparks:.35,particleCount:14e3,fill:.5,motion:"drift",particleShape:"square",depth:.7,sway:.5,twinkle:.5,haze:.5,dustSpeed:.8},abyss:{color:"#3F7BFF",strands:5,crackle:.55,flares:.6,glow:.9,sparks:.4,particleCount:2e4,fill:.8,motion:"orbit",particleShape:"round",depth:.8,sway:.8,twinkle:.5,haze:.6,dustSpeed:.9}},Zr={rise:0,fall:1,drift:2,orbit:3},Yr={square:0,round:1},pr=8,At=4,Qr=4e4,_e=256,Kr=45e5,Jr=2.2,es=7,lt=[1,1,1],_t=[0,0,0],X=(t,e,i)=>Math.min(Math.max(t,e),i),Fe=(t,e,i)=>{let r=X((i-t)/(e-t),0,1);return r*r*(3-2*r)},cr=t=>1-Math.pow(1-t,3),Ve=(t,e,i)=>t.map((r,s)=>r+(e[s]-r)*i),ur=t=>t-Math.PI*2*Math.floor((t+Math.PI)/(Math.PI*2)),fr=(t,e)=>{try{let i=document.createElement("canvas").getContext("2d");if(!i)return e;i.fillStyle="#000000",i.fillStyle=t;let r=i.fillStyle;if(r.startsWith("#")){let n=parseInt(r.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}let s=r.match(/[\d.]+/g);return!s||s.length<3?e:[Number(s[0])/255,Number(s[1])/255,Number(s[2])/255]}catch{return e}},ts=t=>t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4),is=t=>t<=.0031308?t*12.92:1.055*Math.pow(t,1/2.4)-.055,Xe=t=>{let[e,i,r]=t.map(ts),s=Math.cbrt(.4122214708*e+.5363325363*i+.0514459929*r),n=Math.cbrt(.2119034982*e+.6806995451*i+.1073969566*r),a=Math.cbrt(.0883024619*e+.2817188376*i+.6299787005*r);return[.2104542553*s+.793617785*n-.0040720468*a,1.9779984951*s-2.428592205*n+.4505937099*a,.0259040371*s+.7827717662*n-.808675766*a]},zt=([t,e,i])=>{let r=Math.pow(t+.3963377774*e+.2158037573*i,3),s=Math.pow(t-.1055613458*e-.0638541728*i,3),n=Math.pow(t-.0894841775*e-1.291485548*i,3);return[4.0767416621*r-3.3077115913*s+.2309699292*n,-1.2684380046*r+2.6097574011*s-.3413193965*n,-.0041960863*r-.7034186147*s+1.707614701*n].map(a=>X(is(X(a,0,1)),0,1))},Ct=(t,e,i)=>zt(Ve(Xe(t),Xe(e),i)),$e=(t,e,i,r)=>{let[s,n,a]=Xe(t),o=Math.hypot(n,a)*r,l=Math.atan2(a,n)+e*Math.PI/180;return zt([X(s+i,0,1),o*Math.cos(l),o*Math.sin(l)])},ve=(t,e,i,r)=>{let[,s,n]=Xe(t),a=Math.max(Math.hypot(s,n)*r,.02),o=Math.atan2(n,s)+e*Math.PI/180;return zt([X(i,0,1),a*Math.cos(o),a*Math.sin(o)])},dr=(t,e)=>{if(e){let i=ve(t,0,Math.min(Xe(t)[0],.62),1.15);return{rim:i,rimHot:i,rimMid:i,rimDeep:ve(t,0,.72,.8),spark:ve(t,0,.6,1.2),sparkGlow:ve(t,0,.78,.8),haze:ve(t,0,.8,.6),edge:ve(t,0,.72,.8),tones:[ve(t,0,.56,1.1),ve(t,16,.6,1.05),ve(t,-16,.5,1.1),ve(t,0,.66,.9),ve(t,0,.74,.7)]}}return{rim:t,rimHot:Ve(t,lt,.72),rimMid:Ve(t,_t,.15),rimDeep:Ve(t,_t,.45),spark:Ve(t,lt,.45),sparkGlow:$e(t,0,-.15,1),haze:Ve(t,_t,.6),edge:$e(t,0,-.3,.9),tones:[$e(t,0,-.06,1),$e(t,16,-.02,1),$e(t,-16,-.12,1.05),$e(Ct(t,lt,.25),0,.04,1),Ct(t,lt,.7)]}},kt=t=>{let e=t>>>0;return()=>{e=e+1831565813>>>0;let i=e;return i=Math.imul(i^i>>>15,i|1),i^=i+Math.imul(i^i>>>7,i|61),((i^i>>>14)>>>0)/4294967296}},rs=()=>{let t=kt(99),e=[[6,12,.6,1.6],[18,34,1.5,3.5],[40,70,3,7],[80,130,6,12]],i={harmonics:[],rates:[],phases:[],flareHarmonics:[],flareRates:[],flarePhases:[]};for(let r=0;r<pr;r++){e.forEach(([n,a,o,l])=>{i.harmonics.push(Math.round(n+t()*(a-n))),i.rates.push((o+t()*(l-o))*(t()<.5?-1:1)),i.phases.push(t()*Math.PI*2)});for(let n=0;n<3;n++)i.flareHarmonics.push(4+Math.floor(t()*6)),i.flareRates.push((.4+t()*.8)*(t()<.5?-1:1)),i.flarePhases.push(t()*Math.PI*2);let s=r===0;i.flareHarmonics.push(s?.75:.95+t()*.3),i.flareRates.push(s?1.15:.8+t()*.2),i.flarePhases.push(s?1:.7+t()*.25)}return i},ss=t=>{let e=kt(1337),i=Math.max(1,Math.ceil(t/_e)),r=new Float32Array(_e*i*4),s=new Float32Array(_e*i*4),n=0,a=0;for(;n<t&&a<t*80;){a++;let o,l,c;if(e()<.28){let f=e()*Math.PI*2,d=.87+Math.sqrt(e())*.105;if(o=Math.cos(f)*d,l=Math.sin(f)*d,e()>Fe(-.6,.3,-l))continue;let p=e();c=p<.5?3:p<.8?2:1}else{o=e()*2-1,l=e()*2-1;let f=Math.hypot(o,l);if(f>.975)continue;let d=Math.pow(Fe(-.25,.85,-l),1.3),p=Fe(.66,.96,f)*Fe(-.7,.3,-l),u=Math.max(d,p*.9);if(e()>.012+.988*u)continue;if(u<.12)c=4;else{let x=e();c=x<.32?0:x<.52?1:x<.8?2:3}}let h=Math.sqrt(Math.max(0,.95-o*o-l*l));r[n*4]=o,r[n*4+1]=l,r[n*4+2]=(e()*2-1)*h,r[n*4+3]=c,s[n*4]=c===4?1.8:e()<.22?2.1:1.3,s[n*4+1]=e(),s[n*4+2]=2.5+e()*3.5,s[n*4+3]=.16+e()*.26,n++}return{home:r,seed:s,count:n,rows:i}},It=`#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`,Pt=`
uint scramble(uint v) {
  v = v * 747796405u + 2891336453u;
  uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (w >> 22u) ^ w;
}

float random(uint v) {
  return float(scramble(v)) * (1.0 / 4294967295.0);
}
`,mr=`
uniform float uDustTime;
uniform vec2 uTurn;
uniform float uMotion;
uniform float uFill;

vec3 settle(vec3 p, out float spread) {
  float bend = exp2((0.5 - uFill) * 1.8);
  float h = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  float y = 2.0 * pow(h, bend) - 1.0;
  float from = sqrt(max(1.0 - p.y * p.y, 1e-4));
  float to = sqrt(max(1.0 - y * y, 0.0));
  spread = clamp(bend * pow(max(h, 1e-3), bend - 1.0) * to / from, 0.25, 1.0);
  return vec3(p.xz * (to / from), y).xzy;
}

vec3 drift(vec4 home, vec4 seed, uint id, out float life, out float spread) {
  vec3 p = settle(home.xyz, spread);
  float t = uDustTime;
  float u = fract(t / seed.z + seed.y);
  life = sin(3.14159265 * u);
  float travel = seed.w;
  if (uMotion < 0.5) {
    p.y += travel * (u - 0.5);
  } else if (uMotion < 1.5) {
    p.y -= travel * (u - 0.5);
  } else if (uMotion < 2.5) {
    p += 0.045 * vec3(
      sin(t * 0.37 + seed.y * 17.0) + 0.5 * sin(t * 0.83 + seed.z * 5.0),
      sin(t * 0.29 + seed.z * 11.0) + 0.5 * sin(t * 0.61 + seed.w * 7.0),
      sin(t * 0.33 + seed.w * 23.0)
    );
  } else {
    float loop = t * (0.6 + 0.9 * random(id * 7u + 3u)) * (random(id * 7u + 10u) < 0.5 ? -1.0 : 1.0) + seed.y * 6.2831853;
    p.xy += (0.025 + 0.05 * random(id * 7u + 16u)) * vec2(cos(loop), sin(loop));
  }
  float wobble = 0.002 + 0.006 * random(id * 7u + 1u);
  float w1 = 0.8 + 2.4 * random(id * 7u + 2u);
  float w2 = 0.8 + 2.4 * random(id * 7u + 4u);
  p += wobble * vec3(sin(t * w1 + seed.y * 40.0), cos(t * w2 + seed.z * 30.0), sin(t * (w1 + w2) * 0.5 + seed.w * 20.0));
  float cy = cos(uTurn.x);
  float sy = sin(uTurn.x);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  float cx = cos(uTurn.y);
  float sx = sin(uTurn.y);
  p.yz = mat2(cx, -sx, sx, cx) * p.yz;
  return p;
}
`,ns=`#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform float uRadius;
uniform float uDpr;
uniform float uLine;
uniform float uTime;
uniform float uFrame;
uniform float uBins;
uniform float uStrands;
uniform float uCrackle;
uniform float uFlares;
uniform float uGlow;
uniform float uHaze;
uniform float uFill;
uniform float uPresence;
uniform float uUnfold;
uniform float uBloom;
uniform float uInside;
uniform float uEncode;
uniform vec3 uRim;
uniform vec3 uRimHot;
uniform vec3 uRimMid;
uniform vec3 uRimDeep;
uniform vec3 uSpark;
uniform vec3 uSparkGlow;
uniform vec3 uHazeColor;
uniform vec3 uEdgeColor;
uniform vec4 uHeat;
uniform vec4 uHarmonics[8];
uniform vec4 uRates[8];
uniform vec4 uPhases[8];
uniform vec4 uFlareHarmonics[8];
uniform vec4 uFlareRates[8];
uniform vec4 uFlarePhases[8];
uniform vec4 uArcs[4];

out vec4 fragColor;
${Pt}
const float PI = 3.14159265;
const float TAU = 6.28318531;
const vec4 AMPS = vec4(0.35, 0.3, 0.22, 0.13);

float bell(float d, float w) {
  float x = d / w;
  return exp(-x * x);
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

float pool(vec2 q) {
  float t = length(q - vec2(0.0, mix(-1.0, -0.66, uFill))) / mix(0.8, 1.35, uFill);
  return t < 0.6 ? mix(0.5, 0.22, t / 0.6) : mix(0.22, 0.0, clamp((t - 0.6) / 0.4, 0.0, 1.0));
}

void main() {
  vec2 p = gl_FragCoord.xy / uDpr - uCenter;
  float r = length(p);
  float R = uRadius;
  float theta = atan(p.y, p.x);
  float lift = p.y / max(r, 1e-3);
  float topDim = 1.0 - 0.35 * pow(max(lift, 0.0), 1.5);
  vec3 col = vec3(0.0);
  float hot = 0.0;
  uint frame = uint(uFrame);

  if (r < R) {
    vec2 q = p / R;
    float chord = sqrt(max(1.0 - dot(q, q), 0.0));
    float haze = pool(q) * (0.55 + 0.45 * chord);
    col += uHazeColor * haze * uHaze * uInside;
    float e = length(q - vec2(0.0, 0.2)) / 1.2;
    float edge = 0.5 * pow(smoothstep(0.62, 1.0, e), 1.4);
    col += uEdgeColor * edge * uInside * (0.5 + 0.5 * uHaze);
  }

  float dr = r - R;
  float halo = 1.0 - smoothstep(R * 0.05, R * 0.105, abs(dr - R * 0.0213));
  col += uRimDeep * 0.18 * halo * topDim * uGlow * uBloom;
  col += uRim * 0.12 * bell(dr + R * 0.0383, R * 0.032) * uGlow * uBloom;
  col += uRim * 0.32 * bell(dr, max(R * 0.0117, uLine)) * uPresence * uUnfold;

  float delta = mod(theta - uHeat.x + PI, TAU) - PI;
  float heat = uHeat.z * uHeat.y * exp(-delta * delta / 0.3);
  float crackle = uCrackle + heat * 0.9;
  float amp = R * 0.016 * (0.3 + 1.4 * crackle) * uUnfold;
  float jitterAmp = R * 0.0048 * (0.3 + 1.4 * uCrackle) * uUnfold * (1.0 + heat * 0.3);
  float flareAmp = R * 0.064 * (0.4 + 1.2 * crackle) * uFlares * 1.6 * uUnfold;

  if (abs(dr) < amp * 2.0 + flareAmp + R * 0.3) {
    float step = TAU / uBins;
    float binPos = (theta + PI) / step;
    float bin0 = floor(binPos);
    float binF = binPos - bin0;
    float th0 = bin0 * step - PI;
    float th1 = th0 + step;
    uint b0 = uint(mod(bin0, uBins));
    uint b1 = uint(mod(bin0 + 1.0, uBins));
    float gain = min(1.0, 2.4 / max(uStrands, 1.0));
    for (int k = 0; k < 8; k++) {
      if (float(k) >= uStrands) break;
      vec4 m = uHarmonics[k];
      vec4 lead = uRates[k] * uTime + uPhases[k];
      float wave0 = dot(AMPS, sin(m * th0 + lead));
      float wave1 = dot(AMPS, sin(m * th1 + lead));
      uint salt = uint(k) * 1013u + frame * 7919u;
      vec4 shape = uFlareHarmonics[k];
      vec4 look = uFlareRates[k];
      vec4 tone = uFlarePhases[k];
      float a = amp * shape.w;
      float off0 = a * wave0 + jitterAmp * (random(b0 + salt) - 0.5);
      float off1 = a * wave1 + jitterAmp * (random(b1 + salt) - 0.5);
      float rc = R + mix(off0, off1, binF);
      float grade = (off1 - off0) / (step * max(r, 1.0));
      float d = abs(r - rc) * inversesqrt(1.0 + grade * grade);
      float swell = 0.8 + 0.4 * (0.5 + 0.5 * sin(3.0 * theta + uTime * 0.7 + tone.x * 1.7));
      float width = uLine * look.w * swell * (1.0 + heat * 0.25);
      float core = exp(-d * d / (width * width));
      float sheath = exp(-d * d / (width * width * 3.0));
      float bright = tone.w * (1.0 + heat * 0.45) * uPresence;
      col += (uRimHot * core * 0.8 + uRim * sheath * 0.32) * bright;
      hot += core * bright;
      vec3 fargs = shape.xyz * theta + look.xyz * uTime + tone.xyz;
      float flare = max(0.0, (sin(fargs.x) + sin(fargs.y) + sin(fargs.z)) / 3.0);
      flare = (flare * flare + heat * 0.35) * flareAmp;
      float dw = abs(r - rc - flare);
      float dm = abs(r - rc - flare * 0.6);
      float dn = abs(r - rc - flare * 0.25);
      vec3 glow = uRimDeep * (0.07 * bell(dw, R * 0.09) + 0.16 * bell(dw, R * 0.05));
      glow += uRimMid * 0.28 * bell(dm, R * 0.027) + uRim * 0.38 * bell(dn, R * 0.013);
      col += glow * gain * topDim * uGlow * uBloom * (1.0 + heat * 1.4);
    }
  }

  for (int i = 0; i < 4; i++) {
    vec4 arc = uArcs[i];
    if (arc.w <= 0.002) continue;
    float mid = arc.x + arc.y * 0.5;
    vec2 center = R * 0.93 * vec2(cos(mid), sin(mid));
    if (distance(p, center) > R * (abs(arc.y) * 0.6 + 0.1) + 12.0) continue;
    float ar = R * 0.955;
    vec2 a0 = ar * vec2(cos(arc.x), sin(arc.x));
    vec2 a2 = ar * vec2(cos(arc.x + arc.y), sin(arc.x + arc.y));
    vec2 a1 = R * (0.955 - arc.z) * vec2(cos(mid), sin(mid));
    float dmin = 1e5;
    float along = 0.0;
    vec2 prev = a0;
    for (int s = 1; s <= 10; s++) {
      float u = float(s) / 10.0;
      vec2 b = mix(mix(a0, a1, u), mix(a1, a2, u), u);
      vec2 pa = p - prev;
      vec2 ba = b - prev;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
      float dist = length(pa - ba * h);
      if (dist < dmin) {
        dmin = dist;
        along = (float(s) - 1.0 + h) / 10.0;
      }
      prev = b;
    }
    float taper = sqrt(max(sin(PI * along), 0.0));
    float arcWidth = uLine * (0.55 + 0.6 * taper);
    float arcCore = exp(-dmin * dmin / (arcWidth * arcWidth));
    float arcGlow = exp(-dmin * dmin / (arcWidth * arcWidth * 12.0));
    col += (uSpark * 0.95 * arcCore + uSparkGlow * 0.4 * arcGlow) * arc.w * taper;
    hot += arcCore * arc.w * taper * 0.6;
  }

  fragColor = vec4(col, hot) * uEncode;
}
`,as=`#version 300 es
precision highp float;

in float aIndex;

uniform sampler2D tHome;
uniform sampler2D tSeed;
uniform sampler2D tOffset;
uniform float uStirred;
uniform vec2 uCenter;
uniform vec2 uViewport;
uniform float uRadius;
uniform float uDpr;
uniform float uDepth;
uniform float uTwinkle;
uniform float uPointScale;
uniform float uReveal;
uniform float uEncode;
uniform vec3 uTones[5];
uniform vec3 uRimTone;

out vec3 vColor;
out float vSize;
${Pt}
${mr}
void main() {
  ivec2 cell = ivec2(int(mod(aIndex, ${_e}.0)), int(floor(aIndex / ${_e}.0)));
  uint id = uint(aIndex);
  vec4 home = texelFetch(tHome, cell, 0);
  vec4 seed = texelFetch(tSeed, cell, 0);
  float life;
  float spread;
  vec3 p = drift(home, seed, id, life, spread);
  if (uStirred > 0.5) p += texelFetch(tOffset, cell, 0).xyz;
  float len = length(p);
  float inside = 1.0 - smoothstep(0.955, 0.985, length(p.xy));
  if (len > 0.975) p *= 0.975 / len;

  float front = p.z * 0.5 + 0.5;
  float depthSize = mix(1.0, 0.7 + 0.6 * front, uDepth);
  float depthLight = mix(1.0, 0.35 + 0.8 * front, uDepth);
  float blink = sin(uDustTime * (2.0 + 6.0 * random(id * 7u + 5u)) + random(id * 7u + 6u) * 6.2831853);
  float twinkle = mix(1.0, smoothstep(-0.9, -0.6, blink), uTwinkle);
  float fade = smoothstep(0.04, 0.12, life);
  float order = (home.y + 1.0) * 0.5 * 0.55 + random(id * 7u + 8u) * 0.25;
  float reveal = smoothstep(order, order + 0.2, uReveal * 1.0);
  float alpha = random(id * 7u + 9u) < 0.5 || home.w > 3.5 ? 1.0 : 0.6;

  float size = seed.x * uPointScale * (0.35 + 0.95 * life) * depthSize * mix(0.5, 1.0, reveal);
  vec2 screen = uCenter + p.xy * uRadius;
  gl_Position = vec4(screen / uViewport * 2.0 - 1.0, 0.0, 1.0);
  float px = size * uDpr;
  gl_PointSize = px + 2.0;
  vSize = px;

  int tone = int(home.w + 0.5);
  float rimLit = smoothstep(0.8, 0.97, length(p.xy));
  vec3 color = uTones[tone] + uRimTone * rimLit * rimLit * 0.12;
  vColor = color * alpha * fade * twinkle * depthLight * reveal * inside * sqrt(spread) * uEncode;
}
`,ls=`#version 300 es
precision highp float;

uniform float uShape;

in vec3 vColor;
in float vSize;

out vec4 fragColor;

void main() {
  vec2 q = (gl_PointCoord - 0.5) * (vSize + 2.0);
  float half_ = max(vSize * 0.5, 0.5);
  float cover;
  if (uShape < 0.5) {
    vec2 c = clamp(half_ - abs(q) + 0.5, 0.0, 1.0);
    cover = c.x * c.y;
  } else {
    cover = clamp(half_ - length(q) + 0.5, 0.0, 1.0);
  }
  if (cover <= 0.0) discard;
  fragColor = vec4(vColor * cover, 0.0);
}
`,os=`#version 300 es
precision highp float;

uniform sampler2D tHome;
uniform sampler2D tSeed;
uniform sampler2D tOffset;
uniform sampler2D tVelocity;
uniform float uDt;
uniform float uReset;
uniform vec4 uBrush;
uniform float uBrushPower;
uniform vec4 uKick;

layout(location = 0) out vec4 outOffset;
layout(location = 1) out vec4 outVelocity;
${Pt}
${mr}
vec3 swirl(vec3 p) {
  float t = uDustTime * 0.15;
  vec3 a = vec3(1.7, 1.9, 1.5) * p.yzx + vec3(t, 1.2, 2.1);
  vec3 b = vec3(2.3, 2.1, 2.7) * p.zxy + vec3(0.4, t * 1.3, 0.9);
  vec3 ca = cos(a) * vec3(1.7, 1.9, 1.5);
  vec3 cb = cos(b) * vec3(2.3, 2.1, 2.7);
  return vec3(ca.z - cb.x, cb.y - ca.x, ca.y - cb.z);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  if (uReset > 0.5) {
    outOffset = vec4(0.0);
    outVelocity = vec4(0.0);
    return;
  }
  uint id = uint(cell.y * ${_e} + cell.x);
  vec4 home = texelFetch(tHome, cell, 0);
  vec4 seed = texelFetch(tSeed, cell, 0);
  vec3 o = texelFetch(tOffset, cell, 0).xyz;
  vec3 v = texelFetch(tVelocity, cell, 0).xyz;
  float life;
  float spread;
  vec3 base = drift(home, seed, id, life, spread);
  vec3 p = base + o;

  float k = mix(0.8, 2.2, random(id * 7u + 11u));
  vec3 acc = -k * o - 1.5 * sqrt(k) * v;

  vec2 gap = p.xy - uBrush.xy;
  float touch = exp(-dot(gap, gap) / 0.07) * uBrushPower;
  acc += (vec3(uBrush.zw, 0.0) - v) * touch * 14.0;
  float pace = length(v);
  if (pace > 1e-4) {
    vec3 heading = v / pace;
    vec3 curl = swirl(p * 1.6);
    acc += (curl - heading * dot(curl, heading)) * min(pace, 2.0) * 1.8;
  }

  if (uKick.z > 0.0) {
    vec3 jolt = vec3(random(id * 7u + 12u), random(id * 7u + 13u), random(id * 7u + 14u)) - 0.5;
    float near = exp(-dot(p.xy - uKick.xy, p.xy - uKick.xy) / 0.4);
    vec3 spinKick = vec3(-p.z, 0.0, p.x) * 0.9;
    vec3 lift = vec3(0.0, 0.5 + 0.8 * random(id * 7u + 15u), 0.0) * (0.3 + 0.7 * smoothstep(0.2, -0.8, p.y));
    v += (jolt * 0.8 + spinKick + lift) * uKick.z * (0.4 + 0.45 * near);
  }

  v += acc * uDt;
  o += v * uDt;
  vec3 q = base + o;
  float len = length(q);
  if (len > 0.97) {
    vec3 n = q / len;
    o -= n * (len - 0.97);
    v -= n * max(dot(v, n), 0.0) * 1.5;
  }
  outOffset = vec4(o, 1.0);
  outVelocity = vec4(v, 1.0);
}
`,hs=`#version 300 es
precision highp float;

uniform sampler2D tScene;
uniform float uLight;
uniform float uDecode;

in vec2 vUv;
out vec4 fragColor;

vec3 soften(vec3 x) {
  vec3 over = max(x - 0.6, 0.0);
  return min(x, 0.6) + 0.4 * (1.0 - exp(-over / 0.4));
}

void main() {
  vec4 scene = texture(tScene, vUv) * uDecode;
  vec3 light = max(scene.rgb, 0.0);
  float peak = max(light.r, max(light.g, light.b));
  if (uLight > 0.5) {
    vec3 hue = light / max(peak, 1e-4);
    float cover = 1.0 - exp(-peak * 2.4);
    vec3 ink = hue * mix(0.92, 0.72, cover);
    float core = clamp(scene.a * 0.7, 0.0, 1.0) * cover;
    vec3 tint = mix(vec3(1.0), hue, 0.22);
    fragColor = vec4(tint * core + ink * cover * (1.0 - core), core + cover * (1.0 - core));
    return;
  }
  light += vec3(max(peak - 1.8, 0.0) * 0.25);
  vec3 shown = soften(light);
  fragColor = vec4(shown, max(shown.r, max(shown.g, shown.b)));
}
`,cs={preset:"abyss",theme:"dark",size:.7,speed:1,interactive:!0,hoverStrength:.7,intro:!0,paused:!1};function gr(t,e={}){let i={...cs,...e},r=hr[i.preset]||hr.plasma,s=P=>i[P]===void 0||i[P]===null?r[P]:i[P],n=i.theme==="light",a={light:n,palette:null,size:i.size,strands:s("strands"),crackle:s("crackle"),flares:s("flares"),glow:s("glow"),sparks:s("sparks"),particleCount:s("particleCount"),fill:s("fill"),motion:s("motion"),particleShape:s("particleShape"),depth:s("depth"),sway:s("sway"),twinkle:s("twinkle"),haze:s("haze"),dustSpeed:s("dustSpeed"),speed:i.speed,interactive:i.interactive,hoverStrength:i.hoverStrength,intro:i.intro,paused:i.paused},o=fr(s("color"),[.95,.36,.82]),l={from:o,to:o,current:o,t:1,duration:1};a.palette=dr(o,n);let c=new be({alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1}),h=c.gl;if(!c.isWebgl2)return h.getExtension("WEBGL_lose_context")?.loseContext(),()=>{};let f=h.canvas;f.style.display="block",f.style.width="100%",f.style.height="100%",f.setAttribute("aria-hidden","true"),t.appendChild(f);let d=!!h.getExtension("EXT_color_buffer_float"),p=d||!!h.getExtension("EXT_color_buffer_half_float"),u=p?1:.25,x=new Se(h),m=new de(h),v=rs(),w=new He(h,{width:1,height:1,depth:!1,type:p?h.HALF_FLOAT:h.UNSIGNED_BYTE,format:h.RGBA,internalFormat:p?h.RGBA16F:h.RGBA,minFilter:h.NEAREST,magFilter:h.NEAREST}),y=new Array(At*4).fill(0),g={uCenter:{value:[0,0]},uRadius:{value:1},uDpr:{value:1},uLine:{value:.6},uTime:{value:0},uFrame:{value:0},uBins:{value:420},uStrands:{value:5},uCrackle:{value:.6},uFlares:{value:.5},uGlow:{value:.8},uHaze:{value:.7},uFill:{value:.5},uPresence:{value:0},uUnfold:{value:0},uBloom:{value:0},uInside:{value:0},uEncode:{value:u},uRim:{value:[1,1,1]},uRimHot:{value:[1,1,1]},uRimMid:{value:[1,1,1]},uRimDeep:{value:[1,1,1]},uSpark:{value:[1,1,1]},uSparkGlow:{value:[1,1,1]},uHazeColor:{value:[0,0,0]},uEdgeColor:{value:[0,0,0]},uHeat:{value:[0,0,0,0]},uHarmonics:{value:v.harmonics},uRates:{value:v.rates},uPhases:{value:v.phases},uFlareHarmonics:{value:v.flareHarmonics},uFlareRates:{value:v.flareRates},uFlarePhases:{value:v.flarePhases},uArcs:{value:y}},M={uDustTime:{value:0},uTurn:{value:[0,0]},uMotion:{value:0},uFill:g.uFill,tHome:{value:m},tSeed:{value:m}},E={...M,tOffset:{value:m},uStirred:{value:0},uCenter:g.uCenter,uViewport:{value:[1,1]},uRadius:g.uRadius,uDpr:g.uDpr,uDepth:{value:.6},uTwinkle:{value:.5},uPointScale:{value:1},uReveal:{value:0},uEncode:{value:u},uTones:{value:new Array(15).fill(1)},uRimTone:{value:[1,1,1]},uShape:{value:0}},T={...M,tOffset:{value:m},tVelocity:{value:m},uDt:{value:.016},uReset:{value:1},uBrush:{value:[0,0,0,0]},uBrushPower:{value:0},uKick:{value:[0,0,0,0]}},U={tScene:{value:w.texture},uLight:{value:0},uDecode:{value:1/u}},I=P=>(P.setBlendFunc(h.ONE,h.ONE),P),C=new fe(h,{geometry:x,program:I(new ue(h,{vertex:It,fragment:ns,uniforms:g,transparent:!0,depthTest:!1,depthWrite:!1}))}),D=I(new ue(h,{vertex:as,fragment:ls,uniforms:E,transparent:!0,depthTest:!1,depthWrite:!1})),z=p?new fe(h,{geometry:x,program:new ue(h,{vertex:It,fragment:os,uniforms:T,depthTest:!1,depthWrite:!1})}):null,O=new fe(h,{geometry:x,program:new ue(h,{vertex:It,fragment:hs,uniforms:U,depthTest:!1,depthWrite:!1})}),b=P=>{P&&(h.deleteFramebuffer(P.buffer),P.textures.forEach(F=>h.deleteTexture(F.texture)))},j=P=>new He(h,{width:_e,height:P,color:2,depth:!1,type:d?h.FLOAT:h.HALF_FLOAT,format:h.RGBA,internalFormat:d?h.RGBA32F:h.RGBA16F,minFilter:h.NEAREST,magFilter:h.NEAREST}),we=(P,F)=>new de(h,{image:P,width:_e,height:F,type:h.FLOAT,format:h.RGBA,internalFormat:h.RGBA32F,minFilter:h.NEAREST,magFilter:h.NEAREST,generateMipmaps:!1,flipY:!1}),N=null,pe=()=>{N&&(N.mesh.geometry.remove(),h.deleteTexture(N.home.texture),h.deleteTexture(N.seed.texture),b(N.read),b(N.write),N=null)},A=()=>{!z||!N||!N.read||!N.write||(T.tOffset.value=m,T.tVelocity.value=m,T.uReset.value=1,c.render({scene:z,target:N.read,clear:!1}),c.render({scene:z,target:N.write,clear:!1}),T.uReset.value=0)},V=P=>{let F=X(Math.round(P/100)*100,0,Qr);if(N&&N.requested===F)return;if(pe(),!F){N=null;return}let _=ss(F),se=new Float32Array(_.count);for(let Me=0;Me<_.count;Me++)se[Me]=Me;let ne=new De(h,{aIndex:{size:1,data:se}});N={requested:F,rows:_.rows,home:we(_.home,_.rows),seed:we(_.seed,_.rows),mesh:new fe(h,{mode:h.POINTS,geometry:ne,program:D}),read:z?j(_.rows):null,write:z?j(_.rows):null},M.tHome.value=N.home,M.tSeed.value=N.seed,A(),J=0},B=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??!1,H=kt(913),Q=1,W=1,ee=0,Re=performance.now(),Le=0,Ge=0,Ue=0,S=0,R=!0,Y=!0,K=0,J=0,ce=0,me=null,q=.3,oe=[],Z={x:0,y:0,inside:!1,fresh:!0},$={angle:0,velocity:0,power:0,near:0},G={x:0,y:0,vx:0,vy:0},te={x:0,y:0,vx:0,vy:0},We=()=>{Q=Math.max(1,t.clientWidth),W=Math.max(1,t.clientHeight),c.dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(Kr/(Q*W))),c.setSize(Q,W),w.setSize(h.canvas.width,h.canvas.height),ye()},Ce=(P,F)=>{oe.length>=At||oe.push({start:P,span:(.05+H()*.07)*(H()<.5?-1:1),curl:.02+H()*.04,life:0,duration:.2+H()*.2,drift:(H()-.5)*.3,strength:F})},qe=P=>{if(ee=0,!Y)return;let F=a,_=Math.min(.05,Math.max(1/240,(P-Re)/1e3));if(Re=P,!F)return;let se=!F.paused&&!B;S=F.intro&&!B?Math.min(1,S+_/Jr):1;let ne=cr(Fe(0,.42,S)),Me=cr(Fe(0,.32,S)),ot=Math.sin(Math.PI*Fe(.22,.78,S))*.35,ge=Math.max(8,X(F.size,.1,1.5)*Math.min(Q,W)/2),Oe=F.interactive&&!B?X(F.hoverStrength,0,1):0,Ke=Z.x-Q/2,Je=W/2-Z.y,Ar=Math.hypot(Ke,Je),ht=Z.inside?Oe:0;$.power<.02&&($.angle=Math.atan2(Je,Ke),$.velocity=0);let _r=ur(Math.atan2(Je,Ke)-$.angle);$.velocity+=(120*_r-19*$.velocity)*_,$.angle=ur($.angle+$.velocity*_),$.power+=(ht-$.power)*(1-Math.exp(-_/(ht>$.power?.3:.55)));let Ir=Math.exp(-Math.pow((Ar-ge)/(ge*.45),2));$.near+=(Ir-$.near)*(1-Math.exp(-_/.15)),K*=Math.exp(-_/.7);let Ne=Ke/ge,Be=Je/ge;Math.hypot(Ne-G.x,Be-G.y)>.6&&(Z.fresh=!0),Z.fresh&&(G.x=Ne,G.y=Be,G.vx=0,G.vy=0,Z.fresh=!1);let Ht=1-Math.exp(-_/.05);G.vx+=((Ne-G.x)/_-G.vx)*Ht,G.vy+=((Be-G.y)/_-G.vy)*Ht,G.x=Ne,G.y=Be;let ct=Math.hypot(G.vx,G.vy),$t=ct>4?4/ct:1,Cr=Math.exp(-Math.max(0,Math.hypot(Ne,Be)-1)*6),Vt=Z.inside?Oe*Cr*ne:0;if(ce=ce*Math.exp(-_/1.2)+Vt*Math.min(ct,4)*_,se){let xe=1+K*.6+$.power*$.near*.3,re=_*Math.max(0,F.speed)*2*xe;Le+=re,Ge+=_*Math.max(0,F.dustSpeed)*(1+K*.4),Ue+=_*Math.max(0,F.dustSpeed);let kr=X(F.crackle+K*.5,0,1.5);if(F.sparks>.01&&S>.55&&(q-=re*F.sparks*2*(.6+kr*.6),q<=0)){let ze=$.power*$.near,ke=H()<ze*.7?$.angle+(H()-.5)*.8:H()<.7?Math.PI/2+(H()-.5)*1.5:H()*Math.PI*2;Ce(ke,.8+ze*.6+K*.4),q=.15+H()*.6}for(let ze=oe.length-1;ze>=0;ze--){let ke=oe[ze];ke.life+=re,ke.start+=ke.drift*re,ke.life>=ke.duration&&oe.splice(ze,1)}}else oe.length=0;for(let xe=0;xe<At;xe++){let re=oe[xe];y[xe*4]=re?re.start:0,y[xe*4+1]=re?re.span:0,y[xe*4+2]=re?re.curl:0,y[xe*4+3]=re?Math.sin(Math.PI*re.life/re.duration)*re.strength:0}V(F.particleCount),l.t<1&&(l.t=Math.min(1,l.t+_/l.duration),l.current=Ct(l.from,l.to,Fe(0,1,l.t)),F.palette=dr(l.current,F.light));let Ee=F.palette;g.uCenter.value=[Q/2,W/2],g.uRadius.value=ge,g.uDpr.value=c.dpr,g.uLine.value=Math.max(.6,ge*.0035),g.uTime.value=Le,g.uFrame.value=Math.floor(Le*24)%1e5,g.uBins.value=X(Math.round(Math.PI*2*ge/2.6),240,900),g.uStrands.value=Math.round(X(F.strands,1,pr)),g.uCrackle.value=X(F.crackle,0,1)+K*.5+ot,g.uFlares.value=X(F.flares,0,1),g.uGlow.value=X(F.glow,0,2)*(1+K*.5+ot)*(F.light?.35:1),g.uHaze.value=X(F.haze,0,2)*(F.light?.6:1),g.uFill.value=X(F.fill,0,1),g.uPresence.value=ne,g.uUnfold.value=Me,g.uBloom.value=ne*ne,g.uInside.value=Fe(.2,.95,S),g.uRim.value=Ee.rim,g.uRimHot.value=Ee.rimHot,g.uRimMid.value=Ee.rimMid,g.uRimDeep.value=Ee.rimDeep,g.uSpark.value=Ee.spark,g.uSparkGlow.value=Ee.sparkGlow,g.uHazeColor.value=Ee.haze,g.uEdgeColor.value=Ee.edge,g.uHeat.value=[$.angle,$.near,$.power*ne,0],M.uDustTime.value=Ge;let Gt=Z.inside?Oe*ne:0,Wt=X(Ne,-1.6,1.6)*Gt,qt=X(Be,-1.6,1.6)*Gt;te.vx+=(40*(Wt-te.x)-11*te.vx)*_,te.vy+=(40*(qt-te.y)-11*te.vy)*_,te.x+=te.vx*_,te.y+=te.vy*_;let Xt=X(F.sway,0,1);M.uTurn.value=[Xt*.42*Math.sin(Ue*.23)+te.x*.3,Xt*.12*Math.sin(Ue*.17+1.3)-te.y*.16],M.uMotion.value=Zr[F.motion]??0,E.uViewport.value=[Q,W],E.uDepth.value=X(F.depth,0,1),E.uTwinkle.value=X(F.twinkle,0,1),E.uPointScale.value=Math.max(1,ge/491),E.uReveal.value=Fe(.18,1,S),E.uTones.value=Ee.tones.flat(),E.uRimTone.value=Ee.rim,E.uShape.value=Yr[F.particleShape]??0;let ae=N;ae&&z&&(ce>.002||me)&&(J=es);let ut=!1;if(ae&&ae.read&&ae.write&&z&&J>0){T.uDt.value=Math.min(_,1/30),T.uBrush.value=[G.x,G.y,G.vx*$t,G.vy*$t],T.uBrushPower.value=Vt,T.uKick.value=me?[me.x,me.y,me.strength,0]:[0,0,0,0],T.tOffset.value=ae.read.textures[0],T.tVelocity.value=ae.read.textures[1],c.render({scene:z,target:ae.write,clear:!1});let xe=ae.read;ae.read=ae.write,ae.write=xe,J-=_,ut=J>0,ut||(J=0,A())}me=null,E.uStirred.value=ut?1:0,E.tOffset.value=ae&&ae.read?ae.read.textures[0]:m,h.clearColor(0,0,0,0),c.render({scene:C,target:w,clear:!0}),N&&c.render({scene:N.mesh,target:w,clear:!1}),U.uLight.value=F.light?1:0,c.render({scene:O,clear:!1});let zr=l.t<1||Math.abs(ht-$.power)>.002||K>.002||J>0||Math.abs($.velocity)>.01||Math.hypot(te.vx,te.vy,te.x-Wt,te.y-qt)>.001;R&&(se||S<1||zr)&&(ee=requestAnimationFrame(qe))},ye=()=>{ee||!R||!Y||(Re=performance.now(),ee=requestAnimationFrame(qe))},Ye=P=>{let F=t.getBoundingClientRect(),_=P.clientX-F.left,se=P.clientY-F.top;return{x:_,y:se,inside:_>=0&&se>=0&&_<=F.width&&se<=F.height}},Qe=P=>{let F=Ye(P);F.inside&&!Z.inside&&(Z.fresh=!0),Z.x=F.x,Z.y=F.y,Z.inside=F.inside,F.inside&&ye()},k=P=>{let F=a,_=Ye(P);if(!F||!F.interactive||B||!_.inside)return;Z.inside||(Z.fresh=!0),Z.x=_.x,Z.y=_.y,Z.inside=!0;let se=Math.max(8,X(F.size,.1,1.5)*Math.min(Q,W)/2),ne=(_.x-Q/2)/se,Me=(W/2-_.y)/se;if(Math.hypot(ne,Me)>1.3)return;let ge=X(F.hoverStrength,0,1);me={x:ne,y:Me,strength:ge*1.2},K=Math.max(K,ge);let Oe=Math.atan2(Me,ne);Ce(Oe+(H()-.5)*.5,1.3),Ce(Oe+Math.PI+(H()-.5)*1.2,1.1),ye()},L=()=>{Z.inside=!1,ye()},ie=P=>{P.relatedTarget||L()},Ae=P=>{P.pointerType==="touch"&&L()},Ut=()=>{document.hidden||ye()};window.addEventListener("pointermove",Qe,{passive:!0}),window.addEventListener("pointerdown",k,{passive:!0}),window.addEventListener("pointerout",ie,{passive:!0}),window.addEventListener("pointerup",Ae,{passive:!0}),window.addEventListener("blur",L),document.addEventListener("visibilitychange",Ut);let Ot=new ResizeObserver(We);Ot.observe(t);let Nt=new IntersectionObserver(([P])=>{R=P.isIntersecting,ye()});Nt.observe(t),We();let Bt=()=>{Y=!1,R=!1,cancelAnimationFrame(ee),Ot.disconnect(),Nt.disconnect(),window.removeEventListener("pointermove",Qe),window.removeEventListener("pointerdown",k),window.removeEventListener("pointerout",ie),window.removeEventListener("pointerup",Ae),window.removeEventListener("blur",L),document.removeEventListener("visibilitychange",Ut),pe(),b(w),h.getExtension("WEBGL_lose_context")?.loseContext(),f.parentNode&&f.parentNode.removeChild(f)};return Bt.setColor=(P,F=1.2)=>{let _=fr(P,l.to);_.every((se,ne)=>se===l.to[ne])||(l.from=l.current,l.to=_,l.duration=Math.max(.01,F),l.t=0,ye())},Bt}var Dt=t=>{let e=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(t);return e?[parseInt(e[1],16)/255,parseInt(e[2],16)/255,parseInt(e[3],16)/255]:[1,1,1]},us=t=>t==="low"?40:t==="high"?110:70,fs=`#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`,ds=`#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

const float MAX_DIST = 20000.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = mix(uHorizonColor, body, t);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`,ps={horizonColor:"#5227FF",waveColor:"#FF9FFC",crestColor:"#FFFFFF",speed:.4,amplitude:2.5,waveScale:.6,waveRatio:.9,swell:35,turbulence:20,tilt:1.11,zoom:1,height:5.5,fogDepth:15,detail:"medium",brightness:1,opacity:1,mouseInteraction:!0,parallaxStrength:.5,grain:!0,grainIntensity:.05};function xr(t,e={}){let i={...ps,...e},r=new be({webgl:2,alpha:!0,premultipliedAlpha:!0,antialias:!1,dpr:Math.min(window.devicePixelRatio||1,2)}),s=r.gl;s.clearColor(0,0,0,0);let n=s.canvas;n.style.width="100%",n.style.height="100%",n.style.display="block",t.appendChild(n);let a=new Se(s),o=new ue(s,{vertex:fs,fragment:ds,uniforms:{iTime:{value:0},iResolution:{value:new Float32Array([1,1])},uSpeed:{value:.4},uAmplitude:{value:2.5},uWaveScale:{value:.6},uWaveRatio:{value:.9},uSwell:{value:35},uTurbulence:{value:20},uTilt:{value:1.11},uZoom:{value:1},uHeight:{value:5.5},uFogDepth:{value:15},uSteps:{value:70},uBrightness:{value:1},uOpacity:{value:1},uGrain:{value:1},uGrainIntensity:{value:.05},uMouse:{value:new Float32Array([.5,.5])},uParallax:{value:.5},uEnableMouse:{value:!0},uHorizonColor:{value:new Float32Array([1,1,1])},uWaveColor:{value:new Float32Array([1,1,1])},uCrestColor:{value:new Float32Array([1,1,1])}}}),l=new fe(s,{geometry:a,program:o}),c=o.uniforms;c.uSpeed.value=i.speed,c.uAmplitude.value=i.amplitude,c.uWaveScale.value=i.waveScale,c.uWaveRatio.value=i.waveRatio,c.uSwell.value=i.swell,c.uTurbulence.value=i.turbulence,c.uTilt.value=i.tilt,c.uZoom.value=i.zoom,c.uHeight.value=i.height,c.uFogDepth.value=i.fogDepth,c.uSteps.value=us(i.detail),c.uBrightness.value=i.brightness,c.uOpacity.value=i.opacity,c.uGrain.value=i.grain?1:0,c.uGrainIntensity.value=i.grainIntensity,c.uParallax.value=i.parallaxStrength,c.uEnableMouse.value=i.mouseInteraction,c.uHorizonColor.value.set(Dt(i.horizonColor)),c.uWaveColor.value.set(Dt(i.waveColor)),c.uCrestColor.value.set(Dt(i.crestColor));let h=()=>{let I=t.getBoundingClientRect(),C=Math.max(1,Math.floor(I.width)),D=Math.max(1,Math.floor(I.height));r.setSize(C,D);let z=o.uniforms.iResolution.value;z[0]=s.drawingBufferWidth,z[1]=s.drawingBufferHeight,r.render({scene:l})},f=new ResizeObserver(h);f.observe(t),h();let d=[.5,.5],p=[.5,.5],u=I=>{let C=n.getBoundingClientRect();p[0]=(I.clientX-C.left)/C.width,p[1]=1-(I.clientY-C.top)/C.height},x=()=>{p[0]=.5,p[1]=.5};n.addEventListener("pointermove",u),n.addEventListener("pointerleave",x);let m=0,v=!0,w=!document.hidden,y=performance.now(),g=I=>{o.uniforms.iTime.value=(I-y)*.001;let C=i.mouseInteraction?p[0]:.5,D=i.mouseInteraction?p[1]:.5;d[0]+=.05*(C-d[0]),d[1]+=.05*(D-d[1]),o.uniforms.uMouse.value[0]=d[0],o.uniforms.uMouse.value[1]=d[1],r.render({scene:l}),m=requestAnimationFrame(g)},M=()=>{v&&w&&m===0&&(m=requestAnimationFrame(g))},E=()=>{m!==0&&(cancelAnimationFrame(m),m=0)},T=new IntersectionObserver(([I])=>{v=I.isIntersecting,v?M():E()},{threshold:0});T.observe(t);let U=()=>{w=!document.hidden,w?M():E()};return document.addEventListener("visibilitychange",U),M(),()=>{E(),f.disconnect(),T.disconnect(),document.removeEventListener("visibilitychange",U),n.removeEventListener("pointermove",u),n.removeEventListener("pointerleave",x);try{t.removeChild(n)}catch{}s.getExtension("WEBGL_lose_context")?.loseContext()}}var br=`data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M39 3 12 37h17l-4 24 27-34H35z" fill="#fff"/></svg>')}`,ms=560,he=4,je=1e20,Ie=5,Ze=3,gs=4e6,vr=t=>{let e=String(t||"").replace("#","");e.length===3&&(e=e.replace(/./g,r=>r+r));let i=parseInt(e.slice(0,6),16);return Number.isNaN(i)?[1,1,1]:[(i>>16&255)/255,(i>>8&255)/255,(i&255)/255]},wr=(t,e,i,r,s)=>{let n=0;i[0]=0,r[0]=-je,r[1]=je;for(let a=1;a<s;a++){let o=(t[a]+a*a-(t[i[n]]+i[n]*i[n]))/(2*a-2*i[n]);for(;o<=r[n];)n--,o=(t[a]+a*a-(t[i[n]]+i[n]*i[n]))/(2*a-2*i[n]);n++,i[n]=a,r[n]=o,r[n+1]=je}n=0;for(let a=0;a<s;a++){for(;r[n+1]<a;)n++;e[a]=(a-i[n])*(a-i[n])+t[i[n]]}},yr=(t,e,i)=>{let r=Math.max(e,i),s=new Float64Array(r),n=new Float64Array(r),a=new Int32Array(r),o=new Float64Array(r+1);for(let l=0;l<e;l++){for(let c=0;c<i;c++)s[c]=t[c*e+l];wr(s,n,a,o,i);for(let c=0;c<i;c++)t[c*e+l]=n[c]}for(let l=0;l<i;l++){for(let c=0;c<e;c++)s[c]=t[l*e+c];wr(s,n,a,o,e);for(let c=0;c<e;c++)t[l*e+c]=n[c]}},Mr=(t,e,i,r,s,n)=>{let a=1/(2*n+1),o=0;for(let l=0;l<=n&&l<s;l++)o+=t[i+l*r];for(let l=0;l<s;l++)e[i+l*r]=o*a,l+n+1<s&&(o+=t[i+(l+n+1)*r]),l-n>=0&&(o-=t[i+(l-n)*r])},Er=(t,e,i,r)=>{let s=new Float32Array(e*i);for(let n=0;n<3;n++){for(let a=0;a<i;a++)Mr(t,s,a*e,1,e,r);for(let a=0;a<e;a++)Mr(s,t,a,e,i,r)}},xs=(t,e,i)=>{let r=new Float32Array(e*i),s=0;for(let h=0;h<e*i;h++)t[h*4+3]<250&&s++;if(s>e*i*.01){for(let h=0;h<e*i;h++)r[h]=t[h*4+3]/255;return r}let n=0,a=0,o=0,l=0,c=h=>{n+=t[h*4],a+=t[h*4+1],o+=t[h*4+2],l++};for(let h=0;h<e;h++)c(h),c((i-1)*e+h);for(let h=0;h<i;h++)c(h*e),c(h*e+e-1);n/=l,a/=l,o/=l;for(let h=0;h<e*i;h++){let f=Math.max(Math.abs(t[h*4]-n),Math.abs(t[h*4+1]-a),Math.abs(t[h*4+2]-o));r[h]=Math.min(1,Math.max(0,(f-24)/48))}return r},Fr=(t,e,i)=>{let{field:r,width:s,height:n}=t,a=Math.min(Math.max(e,.5),s-.5),o=Math.min(Math.max(i,.5),n-.5),l=Math.min(Math.floor(a-.5),s-2),c=Math.min(Math.floor(o-.5),n-2),h=a-.5-l,f=o-.5-c,d=c*s+l,p=r[d]+(r[d+1]-r[d])*h,u=r[d+s]+(r[d+s+1]-r[d+s])*h;return p+(u-p)*f+Math.hypot(e-a,i-o)},vs=t=>{let e=t.naturalWidth||t.width,i=t.naturalHeight||t.height;if(!e||!i)return null;let r=ms/Math.max(e,i),s=Math.max(2,Math.round(e*r)),n=Math.max(2,Math.round(i*r)),a=document.createElement("canvas");a.width=s,a.height=n;let o=a.getContext("2d",{willReadFrequently:!0});if(!o)return null;o.drawImage(t,0,0,s,n);let l=xs(o.getImageData(0,0,s,n).data,s,n),c=s,h=n,f=-1,d=-1;for(let A=0;A<n;A++)for(let V=0;V<s;V++)l[A*s+V]<=.01||(V<c&&(c=V),V>f&&(f=V),A<h&&(h=A),A>d&&(d=A));if(f<0)return null;let p=f-c+1,u=d-h+1,x=Math.ceil(Math.max(p,u)*.25)+2,m=p+x*2,v=u+x*2,w=new Float32Array(m*v),y=new Float32Array(m*v);for(let A=0;A<v;A++)for(let V=0;V<m;V++){let B=V-x+c,H=A-x+h,Q=B>=0&&H>=0&&B<s&&H<n?l[H*s+B]:0,W=A*m+V;if(Q>=1)w[W]=0,y[W]=je;else if(Q<=0)w[W]=je,y[W]=0;else{let ee=.5-Q;w[W]=ee>0?ee*ee:0,y[W]=ee<0?ee*ee:0}}yr(w,m,v),yr(y,m,v);let g=new Float32Array(m*v);for(let A=0;A<m*v;A++)g[A]=Math.sqrt(w[A])-Math.sqrt(y[A]);let M=[];for(let A=1;A<v-1;A++)for(let V=1;V<m-1;V++){let B=A*m+V,H=g[B];if(H>0||g[B-1]<=0&&g[B+1]<=0&&g[B-m]<=0&&g[B+m]<=0)continue;let Q=g[B+1]-g[B-1],W=g[B+m]-g[B-m],ee=Math.hypot(Q,W)||1;M.push(V+.5-H*Q/ee,A+.5-H*W/ee)}let E=Math.max(1,Math.ceil(M.length/2/3e3))*2,T=[];for(let A=0;A<M.length;A+=E)T.push(M[A],M[A+1]);let U=Math.max(p,u),I=Math.ceil(U*.7/he),C=Math.ceil(p/he)+I*2,D=Math.ceil(u/he)+I*2,z=new Float32Array(C*D);for(let A=0;A<v;A++){let V=Math.floor((A-x)/he)+I;for(let B=0;B<m;B++){let H=Math.floor((B-x)/he)+I;z[V*C+H]+=Math.exp(-Math.abs(g[A*m+B])/1.5)/(he*he)}}let O=z.slice(),b=Math.max(1,Math.round(U*.035/he)),j=Math.max(2,Math.round(U*.13/he));Er(z,C,D,b),Er(O,C,D,j);let we=Math.sqrt(2*Math.PI*(b*b+b))*he/3,N=Math.sqrt(2*Math.PI*(j*j+j))*he/3,pe=new Float32Array(C*D*2);for(let A=0;A<C*D;A++)pe[A*2]=z[A]*we,pe[A*2+1]=O[A]*N;return{field:g,edges:T,width:m,height:v,pad:x,logoWidth:p,logoHeight:u,glow:pe,glowWidth:C,glowHeight:D,glowOffset:x-I*he,left:c,top:h,imageWidth:s,imageHeight:n}},Lt=(t,e,i)=>{let{edges:r,logoWidth:s,logoHeight:n}=t,a=r.length/2;if(a<2)return null;let o=Math.max(s,n),l=Math.floor(Math.random()*a);if(i){let f=!1;for(let d=0;d<40&&!f;d++){let p=Math.floor(Math.random()*a);Math.hypot(r[p*2]-i.x,r[p*2+1]-i.y)<i.radius&&(l=p,f=!0)}if(!f)return null}let c=r[l*2],h=r[l*2+1];for(let f=0;f<24;f++){let d=Math.floor(Math.random()*a),p=r[d*2],u=r[d*2+1],x=Math.hypot(p-c,u-h);if(x<o*.08||x>o*.3)continue;let m=-(u-h)/x,v=(p-c)/x,w=x*(.2+Math.random()*.3),y=(c+p)/2,g=(h+u)/2,M=Fr(t,y+m*w,g+v*w),E=Fr(t,y-m*w,g-v*w);if(!(Math.max(M,E)<=0))return{ax:c,ay:h,bx:p,by:u,bow:M>=E?w:-w,seed:1+Math.random()*60,born:e,life:.35+Math.random()*.45}}return null},ws=`#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`,ys=`#version 300 es
precision highp float;
precision highp int;

uniform sampler2D tFieldFrom;
uniform sampler2D tGlowFrom;
uniform sampler2D tFieldTo;
uniform sampler2D tGlowTo;
uniform vec4 uMapFrom;
uniform vec4 uSizeFrom;
uniform vec4 uMapTo;
uniform vec4 uSizeTo;
uniform float uMorph;
uniform vec2 uResolution;
uniform float uUnit;
uniform float uTime;
uniform float uPresence;
uniform vec3 uHover;
uniform float uHoverRadius;
uniform vec4 uPulses[${Ze}];
uniform float uPulseBoost;
uniform float uFlash;
uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uIntensity;
uniform float uGlow;
uniform float uThickness;
uniform float uStrands;
uniform float uBend;
uniform float uCrackle;
uniform float uFlicker;
uniform float uFill;
uniform float uInk;
uniform vec4 uArcEnds[${Ie}];
uniform vec4 uArcShape[${Ie}];

in vec2 vUv;
out vec4 fragColor;

uint scramble(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

float fieldAt(sampler2D tex, vec4 map, vec4 size, vec2 p) {
  vec2 f = (p - map.xy) / map.z;
  vec2 c = clamp(f, vec2(0.5), size.xy - 0.5);
  return (textureLod(tex, c / size.xy, 0.0).r + length(f - c)) * map.z;
}

vec2 glowAt(sampler2D tex, vec4 map, vec4 size, vec2 p) {
  vec2 f = (p - map.xy) / map.z - map.w;
  return textureLod(tex, f / (size.zw * ${he}.0), 0.0).rg;
}

float shape(vec2 p, float k) {
  float to = fieldAt(tFieldTo, uMapTo, uSizeTo, p);
  if (k >= 1.0) return to;
  return mix(fieldAt(tFieldFrom, uMapFrom, uSizeFrom, p), to, k);
}

vec2 aura(vec2 p, float k) {
  vec2 to = glowAt(tGlowTo, uMapTo, uSizeTo, p);
  if (k >= 1.0) return to;
  return mix(glowAt(tGlowFrom, uMapFrom, uSizeFrom, p), to, k);
}

vec4 corner(ivec2 c, uint seed) {
  uint h = scramble(uint(c.x) * 0x8da6b343u + uint(c.y) * 0xd8163841u + seed * 0xcb1ab31fu);
  return vec4(uvec4(h, h >> 8u, h >> 16u, h >> 24u) & 255u) / 127.5 - 1.0;
}

vec2 drift(vec2 p, uint seed, out mat2 jac) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  ivec2 c = ivec2(i);
  vec4 ga = corner(c, seed);
  vec4 gb = corner(c + ivec2(1, 0), seed);
  vec4 gc = corner(c + ivec2(0, 1), seed);
  vec4 gd = corner(c + ivec2(1, 1), seed);
  vec2 fb = f - vec2(1.0, 0.0);
  vec2 fc = f - vec2(0.0, 1.0);
  vec2 fd = f - vec2(1.0);
  vec2 va = vec2(dot(ga.xy, f), dot(ga.zw, f));
  vec2 vb = vec2(dot(gb.xy, fb), dot(gb.zw, fb));
  vec2 vc = vec2(dot(gc.xy, fc), dot(gc.zw, fc));
  vec2 vd = vec2(dot(gd.xy, fd), dot(gd.zw, fd));
  vec2 k = va - vb - vc + vd;
  vec4 g = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd);
  jac = mat2(
    g.xy + du * (u.yx * k.x + vec2(vb.x - va.x, vc.x - va.x)),
    g.zw + du * (u.yx * k.y + vec2(vb.y - va.y, vc.y - va.y))
  );
  return va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k;
}

float wobble(vec2 p, uint seed) {
  mat2 jac;
  return drift(p, seed, jac).x;
}

vec2 ripple(vec2 p, out float surge) {
  vec2 push = vec2(0.0);
  surge = 0.0;
  float width = uUnit * 10.0;
  for (int i = 0; i < ${Ze}; i++) {
    vec4 pulse = uPulses[i];
    if (pulse.w <= 0.0) continue;
    vec2 d = p - pulse.xy;
    float dist = length(d);
    float front = (dist - pulse.z * uUnit * 150.0) / width;
    float env = exp(-front * front) * pulse.w * exp(-pulse.z * 1.7) * smoothstep(0.0, uUnit * 8.0, dist);
    push += d / max(dist, 1.0) * env * cos(front * 2.2) * uUnit * 7.5;
    surge += env;
  }
  return push;
}

vec2 wander(vec2 p, float t, uint seed, float reachScale, out mat2 jac, out vec2 sway) {
  vec2 q = p / uUnit;
  mat2 ja;
  mat2 jb;
  mat2 jc;
  mat2 jd;
  vec2 a = drift(q * 0.028 + vec2(t * 0.29, t * 0.21), seed, ja);
  vec2 b = drift(q * 0.085 + a * 0.4 + vec2(t * 0.83, -t * 0.61) + 17.0, seed + 1u, jb);
  vec2 c = drift(p / 9.0 + b * 0.6 + vec2(t * 1.9, t * 1.3) + 5.0, seed + 2u, jc);
  vec2 d = drift(p / 4.1 + vec2(-t * 2.7, t * 2.2) + 11.0, seed + 3u, jd);
  float bendAmp = uBend * 8.0 * reachScale;
  float rippleAmp = uBend * 3.2 * reachScale;
  float crinkleAmp = uCrackle * 1.5 * reachScale;
  jac = ja * (0.028 * bendAmp) + jb * (0.085 * rippleAmp) + jc * (crinkleAmp / 9.0) + jd * (crinkleAmp * 0.35 / 4.1);
  sway = (a * bendAmp + b * rippleAmp) * uUnit;
  return sway + (c + d * 0.35) * crinkleAmp;
}

vec2 glowShape(float line, float spread, float w) {
  float x = abs(line);
  float y = abs(spread);
  return vec2(exp(-x * x / (w * w * 0.5)) + exp(-y / (w * 2.2)) * 0.6, exp(-y / (w * 4.5)) * 0.5);
}

void addArc(vec2 p, vec4 ends, vec4 info, float t, inout vec3 light, inout float energy, inout float hot) {
  if (info.y < 0.002) return;
  vec2 ab = ends.zw - ends.xy;
  float len = max(length(ab), 1.0);
  vec2 dir = ab / len;
  vec2 rel = p - ends.xy;
  float s = dot(rel, dir);
  float h = dot(rel, vec2(-dir.y, dir.x));
  float margin = abs(info.x) + uCrackle * (2.0 + len * 0.08) + uThickness * 12.0 + 10.0;
  if (s < -margin || s > len + margin || abs(h) > margin) return;
  float u = clamp(s / len, 0.0, 1.0);
  float taper = sin(3.14159265 * u);
  float bendSlope = s > 0.0 && s < len ? 3.14159265 / len * cos(3.14159265 * u) : 0.0;
  float beyond = max(-s, 0.0) + max(s - len, 0.0);
  for (int c = 0; c < 2; c++) {
    uint seed = uint(info.z * 131.0) + uint(c) * 29u + 7u;
    float jag = 0.0;
    float jagSlope = 0.0;
    float wave = max(len * 0.3, 14.0);
    float weight = uCrackle * (1.5 + len * 0.05) * (c == 0 ? 1.0 : 1.5);
    for (int o = 0; o < 3; o++) {
      mat2 jac;
      float n = drift(vec2(s / wave + info.z * 3.0, t * (1.4 + float(o) * 1.1)), seed + uint(o), jac).x;
      jag += n * weight;
      jagSlope += jac[0].x * weight / wave;
      wave *= 0.42;
      weight *= 0.4;
    }
    float offset = (info.x + jag) * taper;
    float offsetSlope = (info.x + jag) * bendSlope + jagSlope * taper;
    float across = (h - offset) / sqrt(1.0 + offsetSlope * offsetSlope);
    float gap = length(vec2(beyond, across));
    float w = uThickness * (c == 0 ? 0.9 : 0.6);
    vec2 g = glowShape(gap, gap, w);
    float k = info.y * (c == 0 ? 1.0 : 0.45);
    light += (uColor * g.x + uGlowColor * g.y * uGlow) * k;
    energy += (g.x + g.y * uGlow) * k;
    hot += exp(-gap * gap / (w * w * 0.16)) * k * (c == 0 ? 1.0 : 0.0);
  }
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
  float t = uTime;
  vec3 light = vec3(0.0);
  float energy = 0.0;
  float hot = 0.0;

  float surge;
  vec2 pr = p - ripple(p, surge);
  float k = uMorph >= 1.0 ? 1.0 : smoothstep(0.0, 1.0, clamp(uMorph * 1.7 - 0.35 + 0.35 * wobble(p / uUnit * 0.018, 41u), 0.0, 1.0));
  float transit = uMorph >= 1.0 ? 0.0 : sin(3.14159265 * uMorph);
  float base = shape(pr, k);

  vec2 toHover = p - uHover.xy;
  float heat = min(uHover.z * exp(-dot(toHover, toHover) / (uHoverRadius * uHoverRadius)) + surge * 1.4 + transit * 0.5, 2.0);
  float heatCap = min(uHover.z + uPulseBoost * 1.4 + transit * 0.5, 2.0);
  float breath = 1.0 + uFlicker * 0.6 * wobble(vec2(t * 2.1, 7.0), 3u);
  float grow = uPresence;

  float edge = abs(base);
  vec2 halo = aura(pr, k);
  float ink = uInk;
  float bloom = (halo.x * 0.16 + halo.y * 0.08) * (1.0 - ink * 0.65) * uGlow * (1.0 + heat * 1.2);
  float body = smoothstep(0.75, -0.75, base) * uFill * (0.06 + 1.2 * min(halo.x, 1.0)) * (1.0 + heat * 0.5);
  light += uGlowColor * bloom * grow * grow;
  energy += bloom * grow * grow;

  float reachScale = mix(0.15, 1.0, grow) * (1.0 + heat * 0.9);
  float reach = (uUnit * uBend * 16.0 + uCrackle * 3.0) * (1.0 + heatCap * 0.9) + uThickness * 20.0 + 8.0;
  if (edge < reach && grow > 0.0) {
    float fade = smoothstep(reach, reach * 0.55, edge);
    vec2 q = pr / uUnit;
    float count = min(uStrands + heat * 2.5, 6.0);
    float limit = min(uStrands + heatCap * 2.5, 6.0);
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      if (fi >= limit) break;
      float present = clamp(count - fi, 0.0, 1.0);
      if (present <= 0.0) continue;
      uint seed = uint(i) * 7u + 3u;
      mat2 jac;
      vec2 sway;
      float lead = i == 0 ? 1.0 : 0.0;
      vec2 warped = pr + wander(pr, t * (1.0 + fi * 0.19), seed, reachScale * mix(0.6 + fi * 0.2, 0.7, lead), jac, sway);
      float dw = shape(warped, k);
      vec2 slope = vec2(shape(warped + vec2(1.0, 0.0), k), shape(warped + vec2(0.0, 1.0), k)) - dw;
      float d = dw / max(length(slope + jac * slope), 0.3);
      float spread = shape(pr + sway, k);
      float swell = 0.5 + 0.5 * wobble(q * 0.06 + vec2(t * 0.9, fi * 5.1 - t * 0.6), seed + 8u);
      float w = uThickness * mix(0.5, 1.0, lead) * (0.5 + swell);
      float vis = mix(0.3 + 0.45 * smoothstep(-0.25, 0.2, wobble(q * 0.035 + vec2(t * 0.21, fi * 3.7), seed + 5u)), 1.0, lead);
      float spark = 1.0 - uFlicker * 0.3 * (0.5 + 0.5 * wobble(vec2(t * 6.0, fi * 2.3), seed + 6u));
      float weight = max(vis, heat * 0.85) * spark * fade * present * (0.7 + 0.6 * swell);
      vec2 g = glowShape(d, spread, w) * weight;
      float soft = mix(1.0, mix(0.5, 1.0, lead), ink);
      vec3 stroke = mix(uColor, uGlowColor, ink * (1.0 - lead) * 0.65);
      float haze = uGlow * (1.0 + heat) * (1.0 - ink * 0.7);
      light += stroke * g.x * soft + uGlowColor * g.y * haze;
      energy += g.x * soft + g.y * haze;
      hot += exp(-d * d / (w * w * 0.16)) * lead * weight;
    }
    light *= grow;
    energy *= grow;
  }

  for (int i = 0; i < ${Ie}; i++) addArc(pr, uArcEnds[i], uArcShape[i], t, light, energy, hot);

  float gain = uIntensity * breath * (1.0 + heat * 0.45) * (1.0 + uFlash * 0.3) * 1.4;
  float alpha = 1.0 - exp(-energy * gain);
  vec3 color = mix(1.0 - exp(-light * gain), alpha * light / max(energy, 1e-4), ink);
  color = mix(color, vec3(alpha), clamp(hot * grow, 0.0, 1.0) * ink * 0.85);
  float tint = (1.0 - exp(-body * gain * 1.2)) * grow * grow * (1.0 - ink * 0.82);
  color += uGlowColor * tint * (1.0 - alpha);
  alpha += tint * (1.0 - alpha);
  float grain = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  alpha = clamp(alpha + grain, 0.0, 1.0);
  fragColor = vec4(clamp(color + grain, 0.0, alpha), alpha);
}
`,Ms={src:br,color:"#ecc7ff",glowColor:"#ad6dff",scale:.7,intensity:1,glow:1,thickness:1.5,strands:4,bend:.6,crackle:1.5,arcs:1,flicker:.6,fill:0,speed:2.5,interactive:!0,cursorIntensity:.75,cursorRadius:100,theme:"dark",fitImage:!1,colorFade:.35};function Tr(t,e={}){let i={...Ms,...e},r=!0,s=null,n=new Image;n.decoding="async",n.onload=()=>{if(r)try{s=vs(n)}catch{s=null}},n.src=i.src||br;let a=new be({dpr:Math.min(window.devicePixelRatio||1,2),alpha:!0,premultipliedAlpha:!0,antialias:!1}),o=a.gl;if(!a.isWebgl2)return o.getExtension("WEBGL_lose_context")?.loseContext(),null;o.clearColor(0,0,0,0);let l=o.canvas;l.style.display="block",l.style.width="100%",l.style.height="100%",t.appendChild(l);let c=()=>({shape:null,field:new de(o,{image:new Float32Array([1e3]),width:1,height:1,internalFormat:o.R16F,format:o.RED,type:o.FLOAT,minFilter:o.LINEAR,magFilter:o.LINEAR,generateMipmaps:!1,flipY:!1,unpackAlignment:1}),glow:new de(o,{image:new Float32Array([0,0]),width:1,height:1,internalFormat:o.RG16F,format:o.RG,type:o.FLOAT,minFilter:o.LINEAR,magFilter:o.LINEAR,generateMipmaps:!1,flipY:!1,unpackAlignment:1})}),h=[c(),c()],f=Array.from({length:Ie*4},()=>0),d=Array.from({length:Ie*4},()=>0),p=Array.from({length:Ze*4},()=>0),u={tFieldFrom:{value:h[1].field},tGlowFrom:{value:h[1].glow},tFieldTo:{value:h[0].field},tGlowTo:{value:h[0].glow},uMapFrom:{value:[0,0,1,0]},uSizeFrom:{value:[1,1,1,1]},uMapTo:{value:[0,0,1,0]},uSizeTo:{value:[1,1,1,1]},uMorph:{value:1},uResolution:{value:[1,1]},uUnit:{value:1},uTime:{value:0},uPresence:{value:0},uHover:{value:[0,0,0]},uHoverRadius:{value:120},uPulses:{value:p},uPulseBoost:{value:0},uFlash:{value:0},uColor:{value:[1,1,1]},uGlowColor:{value:[.43,.48,1]},uIntensity:{value:1},uGlow:{value:1},uThickness:{value:1.8},uStrands:{value:3},uBend:{value:1},uCrackle:{value:1},uFlicker:{value:.4},uFill:{value:.5},uInk:{value:0},uArcEnds:{value:f},uArcShape:{value:d}},x=new fe(o,{geometry:new Se(o),program:new ue(o,{vertex:ws,fragment:ys,uniforms:u,depthTest:!1,depthWrite:!1})}),m=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??!1,v={x:0,y:0,over:!1},w={x:0,y:0,vx:0,vy:0,power:0},y=[],g=[],M=0,E=null,T=1,U=null,I=0,C=0,D=[[1,1,1],[1,1,1]],z=!1,O=0,b=1,j=1,we=0,N=performance.now(),pe=!0,A=(S,R)=>{S.shape=R,S.field.image=R.field,S.field.width=R.width,S.field.height=R.height,S.field.needsUpdate=!0,S.glow.image=R.glow,S.glow.width=R.glowWidth,S.glow.height=R.glowHeight,S.glow.needsUpdate=!0},V=(S,R)=>{if(R.fitImage){let K=Math.max(1e-4,Math.min(b*R.scale/S.imageWidth,j*R.scale/S.imageHeight));return{fit:K,ox:b/2-(S.imageWidth/2+S.pad-S.left)*K,oy:j/2-(S.imageHeight/2+S.pad-S.top)*K,unit:Math.max(S.imageWidth,S.imageHeight)*K/100}}let Y=Math.max(1e-4,Math.min(b*R.scale/S.logoWidth,j*R.scale/S.logoHeight));return{fit:Y,ox:b/2-(S.pad+S.logoWidth/2)*Y,oy:j/2-(S.pad+S.logoHeight/2)*Y,unit:Math.max(S.logoWidth,S.logoHeight)*Y/100}},B=()=>{b=Math.max(1,t.clientWidth),j=Math.max(1,t.clientHeight),a.dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(gs/(b*j))),a.setSize(b,j),u.uResolution.value=[b,j]},H=S=>{we=0;let R=i,Y=Math.min(.05,Math.max(0,(S-N)/1e3));N=S;let K=s;K&&K!==h[M].shape&&(E=K),E&&T>=1&&(h[M].shape&&(M=1-M,T=0,y.length=0),A(h[M],E),E=null),T<1&&(T=Math.min(1,T+Y/(E?.3:1.6)));let J=h[M].shape,ce=T<1?h[1-M].shape:null;J&&(I=Math.min(1,I+Y/1.4));let me=I*I*(3-2*I);if(J&&R){let q=V(J,R),oe=ce?V(ce,R):q,Z=T*T*(3-2*T),$=oe.unit+(q.unit-oe.unit)*Z,G=R.interactive&&v.over;G&&w.power<.01&&(w.x=v.x,w.y=v.y,w.vx=0,w.vy=0),w.vx+=((v.x-w.x)*120-w.vx*19)*Y,w.vy+=((v.y-w.y)*120-w.vy*19)*Y,w.x+=w.vx*Y,w.y+=w.vy*Y,w.power+=((G?1:0)-w.power)*(1-Math.exp(-Y/(G?.3:.55)));let te=m?.2:1;O+=Y*R.speed*te;for(let k=y.length-1;k>=0;k--)O-y[k].born>y[k].life&&y.splice(k,1);let We=k=>({x:(k.x-q.ox)/q.fit,y:(k.y-q.oy)/q.fit,radius:Math.max(1,R.cursorRadius)/q.fit});if(U&&T>=1&&R.arcs>0)for(let k=0;k<3&&y.length<Ie;k++){let L=Lt(J,O,We(U));L&&y.push(L)}if(U=null,!m&&me>.8&&T>=1&&y.length<Ie){let k=Y*R.speed*R.arcs;if(Math.random()<k*6*w.power*R.cursorIntensity){let L=Lt(J,O,We(w));L&&y.push(L)}else if(Math.random()<k*2.2){let L=Lt(J,O,null);L&&y.push(L)}}for(let k=0;k<Ie;k++){let L=k*4,ie=y[k];if(!ie){d[L+1]=0;continue}let Ae=(O-ie.born)/ie.life;f[L]=q.ox+ie.ax*q.fit,f[L+1]=q.oy+ie.ay*q.fit,f[L+2]=q.ox+ie.bx*q.fit,f[L+3]=q.oy+ie.by*q.fit,d[L]=ie.bow*q.fit,d[L+1]=Math.sin(Math.PI*Math.min(1,Math.max(0,Ae)))*me,d[L+2]=ie.seed}let Ce=0,qe=0;for(let k=g.length-1;k>=0;k--)(S-g[k].born)/1e3>2&&g.splice(k,1);for(let k=0;k<Ze;k++){let L=k*4,ie=g[k];if(!ie){p[L+3]=0;continue}let Ae=(S-ie.born)/1e3;p[L]=ie.x,p[L+1]=ie.y,p[L+2]=Ae,p[L+3]=1,Ce=Math.max(Ce,Math.exp(-Ae*1.7)),qe+=Math.exp(-Ae*7)}let ye=h[1-M];u.tFieldTo.value=h[M].field,u.tGlowTo.value=h[M].glow,u.tFieldFrom.value=ye.field,u.tGlowFrom.value=ye.glow,u.uMapTo.value=[q.ox,q.oy,q.fit,J.glowOffset],u.uSizeTo.value=[J.width,J.height,J.glowWidth,J.glowHeight],ce&&(u.uMapFrom.value=[oe.ox,oe.oy,oe.fit,ce.glowOffset],u.uSizeFrom.value=[ce.width,ce.height,ce.glowWidth,ce.glowHeight]),u.uMorph.value=T,u.uUnit.value=$,u.uTime.value=O,u.uPresence.value=me,u.uHover.value=[w.x,w.y,w.power*Math.max(0,R.cursorIntensity)],u.uHoverRadius.value=Math.max(1,R.cursorRadius),u.uPulseBoost.value=Ce,u.uFlash.value=qe;let Ye=[vr(R.color),vr(R.glowColor)],Qe=z?1-Math.exp(-Y/R.colorFade):1;z=!0;for(let k=0;k<2;k++)for(let L=0;L<3;L++)D[k][L]+=(Ye[k][L]-D[k][L])*Qe;u.uColor.value=D[0].slice(),u.uGlowColor.value=D[1].slice(),u.uIntensity.value=R.intensity,u.uGlow.value=R.glow,u.uThickness.value=R.thickness,u.uStrands.value=Math.max(1,Math.min(6,Math.round(R.strands))),u.uBend.value=R.bend,u.uCrackle.value=R.crackle,u.uFlicker.value=m?0:R.flicker,C+=((R.theme==="light"?1:0)-C)*(1-Math.exp(-Y/.25)),u.uFill.value=R.fill,u.uInk.value=C,a.render({scene:x}),R.onRender?.(l)}pe&&(we=requestAnimationFrame(H))},Q=()=>{we||!pe||(N=performance.now(),we=requestAnimationFrame(H))},W=S=>{let R=t.getBoundingClientRect();v.x=S.clientX-R.left,v.y=S.clientY-R.top,v.over=!0},ee=S=>{W(S),!(!i.interactive||m)&&(g.push({x:v.x,y:v.y,born:performance.now()}),g.length>Ze&&g.shift(),U={x:v.x,y:v.y})},Re=()=>{v.over=!1};t.addEventListener("pointermove",W),t.addEventListener("pointerdown",ee),t.addEventListener("pointerleave",Re),t.addEventListener("pointercancel",Re);let Le=new ResizeObserver(B);Le.observe(t);let Ge=new IntersectionObserver(([S])=>{pe=S.isIntersecting,Q()});Ge.observe(t),B(),Q();let Ue=()=>{r=!1,n.onload=null,pe=!1,cancelAnimationFrame(we),Le.disconnect(),Ge.disconnect(),t.removeEventListener("pointermove",W),t.removeEventListener("pointerdown",ee),t.removeEventListener("pointerleave",Re),t.removeEventListener("pointercancel",Re),o.getExtension("WEBGL_lose_context")?.loseContext(),l.parentNode&&l.parentNode.removeChild(l)};return Ue.setColors=(S,R)=>{i.color=S,i.glowColor=R},Ue}var Sr="data:image/png;base64,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";var Rr="data:image/png;base64,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";window.mountCrystalizedBall=gr;window.mountGradientWaves=xr;window.mountElectricLogo=Tr;window.splashLogoMasks={arch:Sr,door:Rr};})();

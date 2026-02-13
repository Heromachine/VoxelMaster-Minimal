// ===============================
// Screen Buffer Operations
// ===============================
"use strict";

function DrawBackground(){
    var buf32=screendata.buf32,len=buf32.length,bg=screendata.backgroundcolor;
    screendata.depthBuffer.fill(Infinity);
    for(var i=0;i<len;i++)buf32[i]=bg;
}

function Flip(){
    screendata.imagedata.data.set(screendata.buf8);
    screendata.context.putImageData(screendata.imagedata,0,0);
}

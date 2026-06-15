// Minimal static server for dist with correct wasm MIME + SPA fallback, on :8099
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','dist');
const MIME={'.js':'application/javascript','.json':'application/json','.html':'text/html','.wasm':'application/wasm','.ico':'image/x-icon','.png':'image/png','.svg':'image/svg+xml','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2'};
http.createServer((req,res)=>{
  let u=decodeURIComponent(req.url.split('?')[0]);
  let fp=path.join(ROOT,u);
  fs.stat(fp,(e,st)=>{
    if(!e && st.isFile()){
      res.setHeader('Content-Type',MIME[path.extname(fp)]||'application/octet-stream');
      fs.createReadStream(fp).pipe(res); return;
    }
    // SPA fallback to index.html (but NEVER for asset-looking paths)
    if(/\.(wasm|js|json|png|ico|svg|css|ttf|woff2|map)$/.test(u)){ res.statusCode=404; res.end('not found'); return; }
    res.setHeader('Content-Type','text/html');
    fs.createReadStream(path.join(ROOT,'index.html')).pipe(res);
  });
}).listen(8099,()=>console.log('static-wasm server on http://localhost:8099'));

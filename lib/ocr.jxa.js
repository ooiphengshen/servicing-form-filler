ObjC.import('Vision');ObjC.import('AppKit');
function run(argv){
 const out=[];
 for(const f of argv){
  const img=$.NSImage.alloc.initWithContentsOfFile(f);
  if(!img||img.isNil()){out.push({file:f,error:'cannot open'});continue}
  const cg=img.CGImageForProposedRectContextHints(null,$(),$());
  const req=$.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel=0; req.usesLanguageCorrection=false;
  const h=$.VNImageRequestHandler.alloc.initWithCGImageOptions(cg,$({}));
  h.performRequestsError($([req]),null);
  const res=req.results; const items=[];
  for(let i=0;i<res.count;i++){const o=res.objectAtIndex(i);const c=o.topCandidates(1).objectAtIndex(0);const b=o.boundingBox;
   items.push({t:c.string.js,x:+b.origin.x.toFixed(4),y:+(1-b.origin.y-b.size.height).toFixed(4),w:+b.size.width.toFixed(4),h:+b.size.height.toFixed(4)})}
  out.push({file:f,items});
 }
 return JSON.stringify(out);
}

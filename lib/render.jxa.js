ObjC.import('PDFKit');ObjC.import('AppKit');
function run(argv){
 const [inp,outdir,scaleS]=argv; const scale=parseFloat(scaleS||'2');
 const doc=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(inp));
 const n=doc.pageCount;
 for(let i=0;i<n;i++){
  const pg=doc.pageAtIndex(i); const b=pg.boundsForBox($.kPDFDisplayBoxMediaBox);
  const w=b.size.width*scale,h=b.size.height*scale;
  const img=pg.thumbnailOfSizeForBox($.NSMakeSize(w,h),$.kPDFDisplayBoxMediaBox);
  const rep=$.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
  const png=rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$());
  png.writeToFileAtomically(outdir+'/p'+(i+1)+'.png',true);
 }
 return n+' pages';
}

(async ()=>{
  try{
    const port = process.env.PORT || '3002';
    const res = await fetch(`http://localhost:${port}/api/chat`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'pollination/flux-schnell',
        messages:[{role:'user', content:'Test Pollination selection after setting real key'}],
        max_tokens:64
      })
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
    
    // Test image generation via Pollination
    try{
      const ir = await fetch(`http://localhost:${port}/api/image`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt: 'A cozy cabin in snowy mountains, digital painting, high detail', model: 'pollination/flux-schnell', size: 1024, n: 1 })
      });
      console.log('\nIMAGE STATUS', ir.status);
      const itext = await ir.text();
      try{ console.log('IMAGE BODY (json):', JSON.parse(itext)); }
      catch(e){ console.log('IMAGE BODY (text):', itext.slice(0,200)); }
    }catch(e){ console.error('IMAGE ERR', e && e.message); }
  }catch(e){
    console.error('ERR', e && e.message);
  }
})();

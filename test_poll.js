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
  }catch(e){
    console.error('ERR', e && e.message);
  }
})();

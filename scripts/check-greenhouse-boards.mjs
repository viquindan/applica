const tokens = ['twilio','stripe','plaid','affirm','brex','ramp','gusto','datadog','figma','airtable','asana','mongodb','cloudflare','rippling','robinhood','coinbase','notion','reddit','duolingo','samsara'];
async function main(){
 for (const token of tokens){
  try {
   const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
   const text = await res.text();
   let count = 0;
   try { count = JSON.parse(text).jobs?.length ?? 0; } catch {}
   console.log(`${token}\t${res.status}\t${count}`);
  } catch (e){ console.log(`${token}\tERR\t0`); }
 }
}
main();

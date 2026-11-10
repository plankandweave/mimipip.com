/* MimiPip's own funnel count: which design page was opened and what went into the cart.
   No cookie, no identifier, nothing about the visitor: the server adds one to a daily counter. */
(()=>{'use strict';
let last='';
function send(e,s){try{navigator.sendBeacon('/api/funnel',new Blob([JSON.stringify({e:e,s:s})],{type:'application/json'}))}catch(_){}}
function seen(){const m=/^\/products\/([a-z0-9-]+)\/?$/.exec(location.pathname);if(!m){last='';return}if(m[1]===last)return;last=m[1];send('product_view',m[1])}
window.mimipipFunnel=send;
const push=history.pushState;history.pushState=function(){const r=push.apply(this,arguments);setTimeout(seen,0);return r};
addEventListener('popstate',()=>setTimeout(seen,0));
seen();
})();

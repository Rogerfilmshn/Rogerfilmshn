(() => {
 const cards=[...document.querySelectorAll('[data-local-video]')];
 const dialog=document.createElement('dialog');dialog.className='film-dialog';dialog.setAttribute('aria-labelledby','film-title');
 dialog.innerHTML='<header><div><h2 id="film-title"></h2><p class="film-subtitle"></p></div><button class="film-close" type="button" aria-label="Cerrar video">Cerrar ×</button></header><video controls playsinline preload="metadata"></video><a class="film-direct" target="_blank" rel="noopener">Abrir video en otra pestaña ↗</a>';
 document.body.append(dialog);const player=dialog.querySelector('video');let trigger=null;
 function open(card){trigger=card;dialog.querySelector('h2').textContent=card.querySelector('.project-title').textContent;dialog.querySelector('p').textContent=card.querySelector('.project-subtitle').textContent;player.src=card.dataset.localVideo;dialog.querySelector('a').href=player.src;dialog.showModal();player.play().catch(()=>{});}
 cards.forEach(card=>card.addEventListener('click',e=>{if(e.defaultPrevented)return;e.preventDefault();open(card);}));
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{player.pause();player.removeAttribute('src');player.load();trigger?.focus({preventScroll:true});});
 // Load only visible thumbnails, with two simultaneous requests at most.
 const queue=[];let active=0;
 const run=()=>{while(active<2&&queue.length){active++;const video=queue.shift();let done=false;
 const finish=()=>{if(done)return;done=true;clearTimeout(timer);active--;run();};
 const timer=setTimeout(finish,12000);video.addEventListener('error',finish,{once:true});
 video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(1,Math.max(0,video.duration/3));},{once:true});
 video.addEventListener('seeked',()=>{video.pause();video.classList.add('ready');finish();},{once:true});
 video.src=video.dataset.src;video.preload='metadata';video.load();
 }};
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){queue.push(e.target);observer.unobserve(e.target);}});run();},{rootMargin:'160px'});cards.forEach(c=>observer.observe(c.querySelector('video')));}
})();

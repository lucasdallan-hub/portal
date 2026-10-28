import http from 'node:http';
import {readFile, watch} from 'node:fs';
import path from 'node:path';
import { createAuth } from './auth.mjs';
const auth=createAuth(process.env.DATA_DIR||path.resolve(import.meta.dirname,'../.data'));
const root=path.resolve(import.meta.dirname,'../public');
const clients=new Set();
watch(root,{recursive:true},()=>{for(const res of clients) res.write('data: update\n\n')});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','same-origin');
 res.setHeader('X-Frame-Options','DENY');
 if(url.pathname.startsWith('/api/')){void auth(req,res,url);return;}
 if(url.pathname==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
 let file;try{file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))}catch{res.writeHead(400).end();return}
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Não encontrado');return}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)});
}).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Nutri portal iniciado na porta '+(process.env.PORT||3000)));

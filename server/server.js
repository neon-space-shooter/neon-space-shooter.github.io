import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder} from 'discord.js';

const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1555904522943987762';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || '';
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'data.json');

function readData(){ try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));}catch{return {players:{}, guildChannels:{}};} }
function writeData(d){ fs.writeFileSync(DATA_FILE, JSON.stringify(d,null,2)); }
const db = readData();
const sessions = new Map();

const app = express();
app.use(express.json({limit:'32kb'}));
app.set('trust proxy', true);

app.get('/health', (_req,res)=>res.json({ok:true,service:'neon-space-shooter-discord'}));

app.post('/api/token', async (req,res)=>{
  if(!CLIENT_SECRET) return res.status(500).json({error:'DISCORD_CLIENT_SECRET not configured'});
  const code = String(req.body?.code || '');
  if(!code) return res.status(400).json({error:'Missing authorization code'});
  try {
    const body = new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code});
    const r = await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const token = await r.json();
    if(!r.ok || !token.access_token) return res.status(401).json({error:'Discord token exchange failed'});
    const me = await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});
    const user = await me.json();
    if(!me.ok || !user.id) return res.status(401).json({error:'Discord identity lookup failed'});
    const session = crypto.randomBytes(32).toString('hex');
    sessions.set(session,{userId:user.id,expires:Date.now()+24*60*60*1000});
    res.json({access_token:token.access_token,session_token:session,user:{id:user.id,username:user.username,global_name:user.global_name || user.username,avatar:user.avatar}});
  } catch(e){ res.status(500).json({error:'Token exchange error'}); }
});

function getUser(req){
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  const s=sessions.get(token);
  if(!s || s.expires<Date.now()){ if(token) sessions.delete(token); return null; }
  return s.userId;
}

app.post('/api/score',(req,res)=>{
  const userId=getUser(req); if(!userId) return res.status(401).json({error:'Not authenticated'});
  const score=Math.floor(Number(req.body?.score)); if(!Number.isFinite(score)||score<0||score>100000000) return res.status(400).json({error:'Invalid score'});
  const now=Date.now(); const p=db.players[userId] ||= {userId,best:0,games:0,lastScore:0,lastPlayed:0,name:'Discord Player'};
  p.games++; p.lastScore=score; p.lastPlayed=now;
  const isNew=score>p.best; if(isNew) p.best=score;
  writeData(db);
  if(isNew) announceHighScore(userId,p).catch(()=>{});
  res.json({ok:true,newHighScore:isNew,best:p.best,rank:getRank(userId)});
});

function sorted(){return Object.values(db.players).sort((a,b)=>b.best-a.best || a.lastPlayed-b.lastPlayed);}
function getRank(userId){const i=sorted().findIndex(p=>p.userId===userId); return i<0?null:i+1;}
app.get('/api/leaderboard',(req,res)=>{const limit=Math.min(100,Math.max(1,Number(req.query.limit)||10)); res.json(sorted().slice(0,limit).map((p,i)=>({rank:i+1,userId:p.userId,best:p.best,games:p.games,name:p.name})));});
app.get('/api/me',(req,res)=>{const userId=getUser(req); if(!userId) return res.status(401).json({error:'Not authenticated'}); const p=db.players[userId]||{userId,best:0,games:0,lastScore:0}; res.json({...p,rank:getRank(userId)});});

async function discordFetchUser(id){
  try{const r=await fetch(`https://discord.com/api/users/${id}`,{headers:{Authorization:`Bot ${BOT_TOKEN}`}}); return r.ok?await r.json():null;}catch{return null;}}

async function announceHighScore(userId,p){
  if(!BOT_TOKEN) return; for(const channelId of Object.values(db.guildChannels)){
    try{const channel=bot.channels.cache.get(channelId); if(!channel?.isTextBased()) continue; const u=await discordFetchUser(userId); const name=u?.global_name||u?.username||p.name||'Player'; await channel.send({embeds:[new EmbedBuilder().setTitle('🚀 New High Score!').setDescription(`**${name}** reached **${p.best.toLocaleString()}** in Neon Space Shooter.`).setColor(0x00ffff).setTimestamp()]});}catch{} }
}

let bot=null;
if(BOT_TOKEN){
  bot=new Client({intents:[GatewayIntentBits.Guilds]});
  const commands=[
    new SlashCommandBuilder().setName('top').setDescription('Show the Neon Space Shooter leaderboard').addIntegerOption(o=>o.setName('limit').setDescription('Number of players (1-25)').setMinValue(1).setMaxValue(25)),
    new SlashCommandBuilder().setName('rank').setDescription('Show your Neon Space Shooter rank'),
    new SlashCommandBuilder().setName('compare').setDescription('Compare with another Discord player').addUserOption(o=>o.setName('player').setDescription('Player to compare').setRequired(true)),
    new SlashCommandBuilder().setName('stats').setDescription('Show your Neon Space Shooter stats'),
    new SlashCommandBuilder().setName('setchannel').setDescription('Set this channel for high-score announcements')
  ].map(c=>c.toJSON());
  bot.once('ready',async()=>{
    const rest=new REST({version:'10'}).setToken(BOT_TOKEN); await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands}); console.log(`Bot online as ${bot.user.tag}`);
  });
  bot.on('interactionCreate',async i=>{
    if(!i.isChatInputCommand()) return;
    if(i.commandName==='setchannel'){db.guildChannels[i.guildId]=i.channelId;writeData(db);return i.reply('✅ High-score announcements will use this channel.');}
    if(i.commandName==='top'){const n=i.options.getInteger('limit')||10; const rows=sorted().slice(0,n); if(!rows.length)return i.reply('No scores yet.'); const lines=rows.map((p,k)=>`**${k+1}.** <@${p.userId}> — **${p.best.toLocaleString()}**`); return i.reply({embeds:[new EmbedBuilder().setTitle('🏆 Neon Space Shooter — Top Scores').setDescription(lines.join('\n')).setColor(0x00ffff)]});}
    const uid=i.user.id; const p=db.players[uid]||{best:0,games:0,lastScore:0};
    if(i.commandName==='rank') return i.reply(`🚀 Your rank: **${getRank(uid)||'Unranked'}** · Best: **${p.best.toLocaleString()}**`);
    if(i.commandName==='stats') return i.reply({embeds:[new EmbedBuilder().setTitle(`📊 ${i.user.globalName||i.user.username}`).addFields({name:'Best Score',value:p.best.toLocaleString(),inline:true},{name:'Games',value:String(p.games),inline:true},{name:'Rank',value:String(getRank(uid)||'Unranked'),inline:true}).setColor(0x00ffff)]});
    if(i.commandName==='compare'){const other=i.options.getUser('player');const q=db.players[other.id]||{best:0,games:0}; return i.reply(`🚀 **${i.user.globalName||i.user.username}**: **${p.best.toLocaleString()}**\n🛰️ **${other.globalName||other.username}**: **${q.best.toLocaleString()}**`);}
  });
  bot.login(BOT_TOKEN).catch(e=>console.error('Bot login failed',e));
}

app.listen(PORT,()=>console.log(`Server listening on ${PORT}`));

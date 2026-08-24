#!/usr/bin/env node
/* Concatenates src/*.js into a single self-contained meatlight.html.
   The placement validator must pass first -- a broken plant does not ship. */
var fs = require('fs'), path = require('path'), cp = require('child_process');

try {
  cp.execFileSync(process.execPath, [path.join(__dirname, 'validate.js')], { stdio: 'inherit' });
} catch (e) {
  console.error('\nbuild aborted: level validation failed');
  process.exit(1);
}

var ORDER = ['10-core.js', '20-tex.js', '30-geom.js', '35-props.js', '40-level.js',
             '50-validate.js', '60-actors.js', '70-audio.js', '80-script.js',
             '90-game.js', '95-loop.js'];

var js = ORDER.map(function (f) {
  return '\n/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
}).join('\n');

var html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MEATLIGHT</title>
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden;
    font-family:"Courier New",monospace;color:#9aa694;}
  #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000;}
  #screen{image-rendering:pixelated;image-rendering:crisp-edges;display:block;
    box-shadow:0 0 90px rgba(0,0,0,0.95) inset, 0 0 30px rgba(0,0,0,0.8);}
  #start{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;background:#000;cursor:pointer;text-align:center;padding:6vh 8vw;z-index:10;}
  #start h1{font-size:clamp(38px,11vw,120px);letter-spacing:.16em;margin:0 0 .1em;color:#c2201a;
    text-shadow:0 0 26px rgba(194,32,26,.32);}
  #start h2{font-size:clamp(11px,2.1vw,17px);letter-spacing:.34em;margin:0 0 2.4em;color:#6d7a68;font-weight:400;}
  #start p{max-width:60ch;line-height:1.85;font-size:clamp(11px,1.6vw,14px);margin:.3em 0;color:#7d8a78;}
  #start .keys{margin-top:2.2em;color:#5c6858;font-size:clamp(10px,1.4vw,13px);line-height:2.1;}
  #start .go{margin-top:2.6em;color:#c9d4c2;letter-spacing:.24em;font-size:clamp(12px,1.9vw,16px);
    animation:bl 1.5s steps(2,end) infinite;}
  #start .warn{margin-top:2.4em;color:#8a4a44;font-size:clamp(9px,1.3vw,12px);letter-spacing:.14em;}
  @keyframes bl{0%,50%{opacity:1}51%,100%{opacity:.25}}
</style>
</head>
<body>
<div id="wrap"><canvas id="screen" width="960" height="720"></canvas></div>
<div id="start">
  <h1>MEATLIGHT</h1>
  <h2>VOSK &amp; SONS RENDERING CO. &nbsp;·&nbsp; PLANT 2 &nbsp;·&nbsp; 1998</h2>
  <p>You are the night security guard. You have thirteen cameras, a door panel, and a radio.</p>
  <p>Dale is on the floor. Sol is on sanitation. Nobody else is in the building.</p>
  <p>At 02:14, Line 3 starts on its own.</p>
  <div class="keys">
    0&ndash;9 &nbsp;/&nbsp; &#91; &#93; &nbsp;&mdash;&nbsp; SELECT CAMERA &nbsp;&nbsp;·&nbsp;&nbsp; Q &nbsp;&mdash;&nbsp; QUAD VIEW<br>
    D &nbsp;&mdash;&nbsp; DOOR CONTROL &nbsp;&nbsp;·&nbsp;&nbsp; P &nbsp;&mdash;&nbsp; PLANT PA<br>
    WASD &nbsp;&mdash;&nbsp; MOVE (ON FOOT) &nbsp;&nbsp;·&nbsp;&nbsp; SHIFT &nbsp;&mdash;&nbsp; RUN &nbsp;&nbsp;·&nbsp;&nbsp; E &nbsp;&mdash;&nbsp; USE<br>
    SPACE &nbsp;&mdash;&nbsp; ADVANCE DIALOGUE
  </div>
  <div class="go">CLICK OR PRESS ENTER TO CLOCK IN</div>
  <div class="warn">GRAPHIC VIOLENCE &nbsp;·&nbsp; STRONG LANGUAGE &nbsp;·&nbsp; FLASHING IMAGES</div>
</div>
<script>
(function(){
"use strict";
${js}
})();
</script>
</body>
</html>
`;

var out = path.join(__dirname, 'meatlight.html');
fs.writeFileSync(out, html);
var kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log('built meatlight.html  (' + kb + ' KB, single file, no external assets)');

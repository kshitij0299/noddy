// STATE, OUTLINES and ASSETS are supplied from this checkout. Additions only.
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'Google Sans Flex',style})));
await figma.loadFontAsync({family:'Google Sans Code',style:'Regular'});
const page=await figma.getNodeByIdAsync('3:2'); await figma.setCurrentPageAsync(page);
const made=[]; const track=n=>(made.push(n.id),n);
const vars={}; for(const [k,id] of Object.entries(STATE.variables))vars[k]=await figma.variables.getVariableByIdAsync(id);
const paint=k=>figma.variables.setBoundVariableForPaint({type:'SOLID',color:STATE.colors[k]},'color',vars[k]);
function box(name,w,h,c='background',dir){const n=track(dir?figma.createAutoLayout(dir):figma.createFrame());n.name=name;n.resize(w,h);n.fills=[paint(c)];n.clipsContent=false;if(dir){n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='FIXED';n.itemSpacing=12;}return n;}
function add(p,n){p.appendChild(n);return n;}
function at(p,n,x,y){add(p,n);n.x=x;n.y=y;return n;}
function edge(n,r=7){n.strokes=[paint('border')];n.strokeWeight=1;n.cornerRadius=r;return n;}
function padding(n,p){n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=p;return n;}
function txt(s,w,size=14,style='Regular',color='foreground',mono=false){const n=track(figma.createText());n.fontName={family:mono?'Google Sans Code':'Google Sans Flex',style};n.fontSize=size;n.lineHeight={unit:'PERCENT',value:145};n.characters=s;n.resize(w,20);n.textAutoResize='HEIGHT';n.fills=[paint(color)];n.name=s.slice(0,70);return n;}
function svg(s,name,w,h){const n=track(figma.createNodeFromSvg(s));n.name=name;n.resize(w,h);made.push(...n.findAll(()=>true).map(x=>x.id));return n;}
async function button(label,w,tone='Secondary',h=40){const spec=STATE.buttons[tone];const master=await figma.getNodeByIdAsync(spec.id);const n=track(master.createInstance());n.setProperties({[spec.label]:label});n.resize(w,h);n.name='Button / '+label;return n;}
function space(p){const n=add(p,box('Flexible space',1,1));n.fills=[];n.layoutSizingVertical='FILL';return n;}
function field(label,values){const row=box(label,408,34,'background','HORIZONTAL');row.counterAxisAlignItems='CENTER';row.itemSpacing=8;add(row,txt(label,180,14,'Medium'));for(const value of values){const input=edge(padding(box('Existing numeric input',label==='transform origin'?220:values.length===1?108:98,32,'background','HORIZONTAL'),8),4);add(input,txt(value,input.width-16,14,'Regular','foreground',true));add(row,input);}return row;}

// Welcome: the existing New tab, cropped to the area that changes.
const welcome=box('01 Existing New tab + one button',636,462);page.appendChild(welcome);welcome.x=100;welcome.y=100;
at(welcome,txt('Welcome screen · existing New tab',580,16,'Medium'),28,20);
const card=edge(padding(box('Existing welcome form',540,358,'background','VERTICAL'),24));card.itemSpacing=16;at(welcome,card,48,70);
const tabs=box('Existing tabs',492,40,'secondary','HORIZONTAL');tabs.cornerRadius=22;tabs.itemSpacing=0;tabs.paddingLeft=4;tabs.counterAxisAlignItems='CENTER';
for(const s of ['New','Load','Restore','Examples']){const t=box(s,121,32,s==='New'?'primary':'secondary','HORIZONTAL');t.cornerRadius=18;t.primaryAxisAlignItems='CENTER';t.counterAxisAlignItems='CENTER';const l=txt(s,110,14,s==='New'?'Medium':'Regular');l.textAlignHorizontal='CENTER';add(t,l);add(tabs,t);}add(card,tabs);
const form=box('Existing New project fields',492,144,'background','VERTICAL');form.itemSpacing=8;add(form,txt('Start a new Noddy project',492,20,'SemiBold'));add(form,txt('Project name:',492,13,'Medium'));
const nameInput=edge(padding(box('Existing project name',492,42,'background','HORIZONTAL'),10),5);add(nameInput,txt('My Font',470,14));add(form,nameInput);add(form,txt('Creates a fresh font project you can start drawing in right away.',492,13,'Regular','muted-foreground'));add(card,form);
add(card,await button('Create a new font from scratch',492,'Primary',40));add(card,await button('Start from scratch with an agent',492,'Secondary',40));

// Context mirrors the running Characters page. Only Agent button/window are new.
const editor=box('02 Existing editor + Agent window',1512,728);editor.fills=[{type:'SOLID',color:{r:0.918,g:0.973,b:1}}];page.appendChild(editor);editor.x=836;editor.y=100;editor.clipsContent=true;
at(editor,txt('Noddy',95,19,'Bold'),44,10);
const menu=box('Existing menus + Agent entry',225,32,'background','HORIZONTAL');menu.fills=[];menu.itemSpacing=14;menu.counterAxisAlignItems='CENTER';for(const s of ['File','Projects','Help'])add(menu,txt(s,s==='Projects'?58:32,13));add(menu,await button('Agent',64,'Secondary',30));at(editor,menu,186,6);
at(editor,txt('Found a bug? Have some feedback?   mail@glyphrstudio.com',380,12,'Regular','muted-foreground'),1120,14);
const side=box('Existing Characters / Attributes',450,660);side.fills=[];at(editor,side,10,44);
const nav=box('Existing navigation',442,48,'background','HORIZONTAL');nav.itemSpacing=2;
for(const [label,value,w] of [['PAGE','Characters',116],['EDITING','Latin Small Letter N',324]]){const a=edge(padding(box(label,w,48,label==='PAGE'?'secondary':'background','VERTICAL'),10),0);a.itemSpacing=1;add(a,txt(label,w-20,11,'Medium','muted-foreground'));add(a,txt(value,w-20,16,'Medium'));add(nav,a);}at(side,nav,4,0);
const panel=padding(box('Existing active panel',442,48,'primary','VERTICAL'),10);panel.itemSpacing=1;add(panel,txt('PANEL',420,11,'Medium'));add(panel,txt('Attributes',420,16,'Medium'));at(side,panel,4,50);
const attrs=edge(padding(box('Existing attribute controls',450,435,'background','VERTICAL'),10));attrs.itemSpacing=9;at(side,attrs,0,106);
add(attrs,txt('Glyph',428,16,'Bold'));add(attrs,field('advance width',['1108']));add(attrs,field('bearings: left / right',['40','60']));
add(attrs,txt('Bulk-edit paths',428,16,'Bold'));add(attrs,field('x / y',['40','1039']));add(attrs,field('width / height',['1008','1039']));add(attrs,field('transform origin',['baseline left']));add(attrs,txt('lock aspect ratio      □',428,14,'Medium'));
const actions=box('Existing actions (labels shown for legibility)',428,32,'background','HORIZONTAL');actions.itemSpacing=8;for(const s of ['Undo','Redo','Add Path','Get Paths'])add(actions,await button(s,s.length>5?94:58,'Secondary',30));add(attrs,actions);add(attrs,txt('Flip horizontal    Flip vertical    Delete    SVG',428,12,'Regular','muted-foreground'));
at(side,txt('m   Previous item                          Next item   o',428,14,'Medium'),20,573);
const tools=box('Existing drawing tools',32,252,'background','VERTICAL');tools.fills=[];tools.itemSpacing=6;
for(const [name,asset] of Object.entries(ASSETS.tools)){const tool=edge(box(name,32,32,name==='resize'?'primary':'background','HORIZONTAL'),5);tool.primaryAxisAlignItems='CENTER';tool.counterAxisAlignItems='CENTER';add(tool,svg(asset,'Existing '+name,20,20));add(tools,tool);}at(editor,tools,480,40);
const canvas=edge(box('Existing glyph canvas',982,676),7);at(editor,canvas,520,40);
for(const [x,y,w,h] of [[369,106,1,466],[630,106,1,466],[358,464,277,1]]){const l=box('Existing glyph guide',w,h,'border');at(canvas,l,x,y);}
at(canvas,svg(`<svg xmlns="http://www.w3.org/2000/svg" width="233" height="240" viewBox="40 -1039 1008 1039"><path d="${OUTLINES.n.path}" fill="#000"/></svg>`,'Actual Oblegg n outline',233,240),378,224);
const zoom=box('Existing canvas view controls',370,34,'background','HORIZONTAL');zoom.itemSpacing=7;for(const s of ['Pan','−','23.1%','+','1:1','Fit','Preview'])add(zoom,await button(s,s==='Preview'?62:s==='23.1%'?62:38,'Secondary',32));at(canvas,zoom,592,634);

// The feature: one movable, non-modal window, operating on the current glyph.
const agent=edge(box('NEW / Agent window',340,484,'background','VERTICAL'),9);agent.itemSpacing=0;agent.effects=[{type:'DROP_SHADOW',color:{r:0.2,g:0.12,b:0.08,a:0.14},offset:{x:0,y:6},radius:22,spread:0,visible:true,blendMode:'NORMAL'}];at(editor,agent,1152,80);
const head=padding(box('Draggable title bar',340,46,'background','HORIZONTAL'),14);head.itemSpacing=10;head.counterAxisAlignItems='CENTER';add(head,txt('Agent',226,15,'SemiBold'));add(head,txt('−     ×',66,18));add(agent,head);
const context=padding(box('Context follows current selection',340,35,'secondary','HORIZONTAL'),10);add(context,txt('Oblegg  /  n  ·  Current glyph',318,12,'Medium'));add(agent,context);
const conversation=padding(box('Conversation',340,259,'background','VERTICAL'),16);conversation.itemSpacing=14;
const prompt=padding(edge(box('User request',308,70,'secondary','VERTICAL'),7),12);add(prompt,txt('Give n 20 more units of space on the right.',282,14));add(conversation,prompt);
add(conversation,txt('✓  Read n’s spacing\n✓  Set right bearing to 60',308,13,'Regular','muted-foreground'));
add(conversation,txt('Done. Right bearing 40 → 60.\nAdvance width 1088 → 1108.',308,14));
add(conversation,await button('Undo',68,'Quiet',28));add(agent,conversation);
const compose=padding(box('Prompt composer',340,144,'background','VERTICAL'),12);compose.itemSpacing=8;
const input=edge(padding(box('Message',316,72,'background','VERTICAL'),10),6);add(input,txt('Ask for another change…',292,14,'Regular','muted-foreground'));add(compose,input);
const send=box('Composer actions',316,32,'background','HORIZONTAL');send.itemSpacing=112;add(send,txt('Current glyph',128,12,'Regular','muted-foreground'));add(send,await button('↑',36,'Primary',32));add(compose,send);add(agent,compose);

const removed=[];for(const id of ['4:2','4:52','4:144','7:18']){const n=await figma.getNodeByIdAsync(id);if(n){removed.push(id);n.remove();}}
page.name='Agent feature · two additions';
function evidence(n){const all=n.findAll(()=>true);const counts={};for(const x of all)counts[x.type]=(counts[x.type]||0)+1;return {id:n.id,name:n.name,width:n.width,height:n.height,counts,images:all.filter(x=>'fills'in x&&Array.isArray(x.fills)&&x.fills.some(f=>f.type==='IMAGE')).map(x=>x.id),badFonts:all.filter(x=>x.type==='TEXT'&&!['Google Sans Flex','Google Sans Code'].includes(x.fontName.family)).map(x=>x.id)};}
return {createdNodeIds:made,mutatedNodeIds:[page.id],removedNodeIds:removed,welcome:evidence(welcome),editor:evidence(editor),agent:agent.id};

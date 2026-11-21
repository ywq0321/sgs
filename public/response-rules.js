// Shared response conversions; validation still happens on the server.
export function responseAs(general,required,cards,equipment={},handIds=cards.map(c=>c.id),turnIsSelf=false){
  if(cards.length===1){const c=cards[0],red=['♥','♦'].includes(c.suit),black=['♠','♣'].includes(c.suit);
    if(c.name===required&&handIds.includes(c.id))return '';
    if(general==='赵云'&&handIds.includes(c.id)&&((required==='闪'&&c.name==='杀')||(required==='杀'&&c.name==='闪')))return required;
    if(required==='闪'&&general==='甄姬'&&black&&handIds.includes(c.id))return '闪';
    if(required==='杀'&&general==='关羽'&&red)return '杀';
    if(required==='桃'&&general==='华佗'&&red&&!turnIsSelf)return '桃';
    if(required==='过河拆桥'&&general==='甘宁'&&black)return required;
    if(required==='乐不思蜀'&&general==='大乔'&&c.suit==='♦')return required;
  }
  if(required==='杀'&&cards.length===2&&equipment.weapon?.name==='丈八蛇矛'&&cards.every(c=>handIds.includes(c.id)))return '杀';
  return null;
}

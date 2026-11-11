export function normalizeRoomCode(value){
  if(typeof value!=='string')throw Error('请输入口令码');
  const code=value.normalize('NFKC').trim().toUpperCase();
  if(!/^[\p{L}\p{N}_-]{2,24}$/u.test(code))throw Error('口令码须为 2～24 个汉字、字母、数字、下划线或短横线');
  return code;
}

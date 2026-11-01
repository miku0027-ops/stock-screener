"""Read verified ZIP members without extraction; normalize Binance microseconds."""
import csv, hashlib, json, pathlib, sys, zipfile
import numpy as np
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/sharpnex-history')
manifest=json.loads((root/'manifest.json').read_text())
for venue in ['spot','futures/um']:
 for symbol in ['BTCUSDT','ETHUSDT']:
  chunks=[]
  for item in manifest['archives']:
   if item['venue']!=venue or item['symbol']!=symbol: continue
   if item['status']=='missing' and '--allow-missing' in sys.argv: continue
   if item['status']!='verified': raise ValueError('Incomplete archive set')
   source=pathlib.Path(item['file'])
   if hashlib.sha256(source.read_bytes()).hexdigest()!=item['sha256']: raise ValueError('Checksum changed')
   with zipfile.ZipFile(source) as z:
    names=[n for n in z.namelist() if n.endswith('.csv')]
    if len(names)!=1: raise ValueError('Unexpected CSV members')
    with z.open(names[0]) as f:
     first=f.readline(); header=not first.split(b',')[0].isdigit();f.seek(0)
     a=np.loadtxt(f,delimiter=',',usecols=(0,1,2,3,4,5),skiprows=int(header))
     a[:,0]/=np.where(a[:,0]>1e14,1e6,1e3)
     chunks.append(a)
  a=np.concatenate(chunks);a=a[np.argsort(a[:,0],kind='stable')]
  if len(np.unique(a[:,0]))!=len(a):raise ValueError('Duplicate timestamps')
  if not np.isfinite(a).all():raise ValueError('Non-finite candle')
  output=root/f'{venue.replace("/","-")}-{symbol}.bin'
  a.astype('<f8').tofile(output)
  print(json.dumps({'file':str(output),'rows':len(a),'gaps':int(np.count_nonzero(np.diff(a[:,0])!=60)),'from':int(a[0,0]),'through':int(a[-1,0])}),flush=True)

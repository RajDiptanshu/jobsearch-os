"""Import Markdown as private preparation data. No document text becomes a system prompt or CV fact."""
import argparse, json, re
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--profile',required=True)
parser.add_argument('--handbook',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
source=Path(args.handbook)
if source.stat().st_size>2_000_000: raise ValueError('Handbook exceeds 2 MB')
profile=json.loads(Path(args.profile).read_text(encoding='utf-8-sig'))
lines=source.read_text(encoding='utf-8-sig').splitlines()
notes=[]; parent=''; start=None; title=''; body=[]; main=0
def emit(end):
    if start is None:return
    content='\n'.join(body).strip()
    if len(content)<60:return
    # All career sections retain PREP status, even when the handbook labels a sentence [CV].
    # Their conflicting resume versions must never replace the selected current profile's facts.
    kind='DESIGN' if main==13 else 'BOUNDARY' if main==15 else 'REFERENCE' if main in (2,3,5,12) else 'PREP'
    for offset in range(0,len(content),4200):
        notes.append(dict(Id=f'handbook-{start+1}-{offset//4200+1}',Title=(parent+' / '+title)[:240],Kind=kind,
            Source=f'{source.name}:lines {start+1}-{end}',Text=content[offset:offset+4200]))
for i,line in enumerate(lines):
    match=re.match(r'^(#{2,3})\s+(.+)',line)
    if match:
        emit(i);start=i;title=match[2];body=[]
        if len(match[1])==2:
            parent=title
            number=re.match(r'(\d+)\.',title);main=int(number[1]) if number else 0
    else:body.append(line)
emit(len(lines))
profile['PreparationNotes']=notes
profile.setdefault('Cautions',[]).append('Preparation handbook may mix CV versions, illustrative architectures and proposed projects. Use only this selected profile CV evidence for past ownership, tenure and outcomes. Handbook PREP/DESIGN text supplies proposed approaches and questions, not proof of implementation.')
out=Path(args.output).resolve()
if out==Path(args.profile).resolve():raise ValueError('Choose a new output profile; preserve the original')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(profile,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'preparationChunks':len(notes),'careerFactsUnchanged':True,'sourceDocumentPreserved':True}))

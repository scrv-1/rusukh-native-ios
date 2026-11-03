import type { PdfResult } from './pdf/contracts';
export const SOURCE_DRAFT_KEY='sourceDraft.v1';
export const CARD_DRAFT_KEY='cardDraft.v1';
export type SourceForm={version:1;mode:'text'|'pdf'|'youtube'|'media';pastedText:string;textTitle:string;videoUrl:string;videoTitle:string;transcript:string;format:'auto'|'text'|'srt'|'vtt';pdfPreview:PdfResult|null};
export const emptySourceForm=():SourceForm=>({version:1,mode:'text',pastedText:'',textTitle:'',videoUrl:'',videoTitle:'تفريغ YouTube',transcript:'',format:'auto',pdfPreview:null});
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
export function validSourceForm(v:unknown):v is SourceForm{
 if(!v||typeof v!=='object')return false;const d=v as SourceForm;
 if(d.version!==1||!['text','pdf','youtube','media'].includes(d.mode)||!['auto','text','srt','vtt'].includes(d.format)||!text(d.pastedText,1_000_000)||!text(d.textTitle,160)||!text(d.videoTitle,160)||!text(d.videoUrl,2048)||!text(d.transcript,1_000_000))return false;
 const p=d.pdfPreview;
 return p===null||!!(p&&['text','no-text'].includes(p.status)&&text(p.title,160)&&text(p.body,1_000_000)&&Number.isInteger(p.pageCount)&&p.pageCount>0&&p.pageCount<=50&&Array.isArray(p.emptyPages)&&p.emptyPages.length<=50&&p.emptyPages.every(n=>Number.isInteger(n)&&n>=1&&n<=p.pageCount)&&Array.isArray(p.warnings)&&p.warnings.length<=10&&p.warnings.every(w=>text(w,2000))&&Array.isArray(p.pages)&&p.pages.length===0);
}
export const sourceHasContent=(v:SourceForm|null)=>!!v&&(!!v.pastedText.trim()||!!v.transcript.trim()||!!v.videoUrl.trim()||!!v.pdfPreview);
export type CardDraft={version:1;noteId:string;noteCreatedAt:number;cardId:string|null;question:string;answer:string};
export function validCardDraft(v:unknown):v is CardDraft{
 if(!v||typeof v!=='object')return false;const d=v as CardDraft;
 return d.version===1&&text(d.noteId,200)&&!!d.noteId&&Number.isFinite(d.noteCreatedAt)&&d.noteCreatedAt>=0&&(d.cardId===null||(text(d.cardId,200)&&!!d.cardId))&&text(d.question,1_000_000)&&text(d.answer,1_000_000);
}

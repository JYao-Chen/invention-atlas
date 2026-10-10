import {micromark} from 'micromark';
import {gfm,gfmHtml} from 'micromark-extension-gfm';
import {math,mathHtml} from 'micromark-extension-math';
import {mathMarkdown} from '../lib/math-markdown';

export function reportMarkdownHtml(text:string){
 // Native MathML keeps the downloaded report usable offline without external fonts or scripts.
 return micromark(mathMarkdown(text),{extensions:[gfm(),math()],htmlExtensions:[gfmHtml(),mathHtml({output:'mathml',throwOnError:false,trust:false,strict:false})]});
}

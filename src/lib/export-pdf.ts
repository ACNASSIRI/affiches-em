/**
 * AFFICHES-EM — Telechargement des affiches en PDF
 * ---------------------------------------------------------------------------
 * Chaque feuille A4 de la zone d'impression est photographiee (html-to-image,
 * environ 250 ppp) puis placee pleine page dans un PDF A4 ecrit ici, sans
 * autre bibliotheque : une image JPEG par page. Le fichier est ensuite
 * telecharge directement, sans passer par la fenetre d'impression.
 */

import { toCanvas } from 'html-to-image';

/** A4 en points PDF (1 pt = 1/72 de pouce). */
const A4_LARGEUR_PT = 595.28;
const A4_HAUTEUR_PT = 841.89;

/** Finesse de la capture : 3 px par pixel CSS ≈ 290 ppp sur une feuille A4. */
const DENSITE = 3;
const QUALITE_JPEG = 0.92;

interface PageJpeg {
  readonly octets: Uint8Array;
  readonly largeur: number;
  readonly hauteur: number;
}

async function capturer(feuille: HTMLElement): Promise<PageJpeg> {
  const canvas = await toCanvas(feuille, {
    pixelRatio: DENSITE,
    backgroundColor: '#ffffff',
    cacheBust: false,
  });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture impossible.'))), 'image/jpeg', QUALITE_JPEG),
  );
  return { octets: new Uint8Array(await blob.arrayBuffer()), largeur: canvas.width, hauteur: canvas.height };
}

/** Ecrit un PDF A4 d'une image JPEG pleine page par feuille. */
function construirePdf(pages: readonly PageJpeg[]): Blob {
  const encodeur = new TextEncoder();
  const morceaux: Uint8Array[] = [];
  const positions: number[] = [];
  let taille = 0;

  const ajouter = (m: Uint8Array | string) => {
    const octets = typeof m === 'string' ? encodeur.encode(m) : m;
    morceaux.push(octets);
    taille += octets.length;
  };
  const objet = (numero: number, corps: string | (() => void)) => {
    positions[numero] = taille;
    ajouter(`${numero} 0 obj\n`);
    if (typeof corps === 'string') ajouter(corps);
    else corps();
    ajouter('\nendobj\n');
  };

  // 1 : catalogue, 2 : arbre des pages, puis 3 objets par page.
  const numeroPage = (i: number) => 3 + i * 3;
  ajouter('%PDF-1.4\n%âãÏÓ\n');
  objet(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objet(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${numeroPage(i)} 0 R`).join(' ')}] >>`);

  pages.forEach((page, i) => {
    const n = numeroPage(i);
    objet(
      n,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_LARGEUR_PT} ${A4_HAUTEUR_PT}] ` +
        `/Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`,
    );
    const contenu = `q ${A4_LARGEUR_PT} 0 0 ${A4_HAUTEUR_PT} 0 0 cm /Im0 Do Q`;
    objet(n + 1, `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`);
    objet(n + 2, () => {
      ajouter(
        `<< /Type /XObject /Subtype /Image /Width ${page.largeur} /Height ${page.hauteur} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.octets.length} >>\nstream\n`,
      );
      ajouter(page.octets);
      ajouter('\nendstream');
    });
  });

  const total = 3 + pages.length * 3;
  const debutTable = taille;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) table += `${String(positions[i]).padStart(10, '0')} 00000 n \n`;
  ajouter(table);
  ajouter(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${debutTable}\n%%EOF\n`);
  return new Blob(morceaux as BlobPart[], { type: 'application/pdf' });
}

/** Nom de fichier simple (sans accents ni symboles) accepte par tous les navigateurs. */
export function nomFichierPdf(base: string): string {
  const jour = new Date().toISOString().slice(0, 10);
  const propre =
    base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, 'et')
      .replace(/[^A-Za-z0-9 ._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Affiches';
  return `${propre} - ${jour}.pdf`;
}

/**
 * Cree le PDF des feuilles donnees et le telecharge.
 * @param progression appelee apres chaque feuille (faites, total)
 */
export async function telechargerPdf(
  feuilles: readonly HTMLElement[],
  nomFichier: string,
  progression?: (faites: number, total: number) => void,
): Promise<void> {
  if (feuilles.length === 0) throw new Error('Aucune feuille a exporter.');
  if (document.fonts?.ready) await document.fonts.ready;
  const pages: PageJpeg[] = [];
  for (const feuille of feuilles) {
    pages.push(await capturer(feuille));
    progression?.(pages.length, feuilles.length);
  }
  const url = URL.createObjectURL(construirePdf(pages));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

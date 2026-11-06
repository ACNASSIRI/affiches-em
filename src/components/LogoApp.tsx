/**
 * Logo de l'application : etiquette prix bleu Marjane (#004D9B), « EM » en
 * jaune Marjane (#FFDD00), sur carre blanc. Meme dessin que public/icon.svg.
 */
export function LogoApp({ taille = 40, titre }: { taille?: number; titre?: string }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 180 180"
      role={titre ? 'img' : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
    >
      <rect width="180" height="180" rx="40" fill="#ffffff" />
      <path d="M28 66a8 8 0 0 1 8-8h80l36 32-36 32H36a8 8 0 0 1-8-8Z" fill="#004d9b" />
      <circle cx="120" cy="90" r="7" fill="#ffffff" />
      <text
        x="70"
        y="104"
        textAnchor="middle"
        fontFamily="'Archivo Narrow', 'Arial Narrow', Arial, sans-serif"
        fontWeight={700}
        fontSize="40"
        fill="#ffdd00"
      >
        EM
      </text>
    </svg>
  );
}

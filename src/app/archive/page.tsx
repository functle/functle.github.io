import type { Metadata } from 'next';
import ArchiveGame from './archive-game';

export const metadata: Metadata = {
  title: 'Archive - Functle',
};

export default function ArchivePage() {
  return <ArchiveGame />;
}

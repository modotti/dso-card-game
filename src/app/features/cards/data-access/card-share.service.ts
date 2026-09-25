import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';

export type CardShareResult = 'shared' | 'downloaded';

@Injectable({ providedIn: 'root' })
export class CardShareService {
  async createImage(node: HTMLElement): Promise<Blob> {
    await document.fonts.ready;
    await this.waitForImages(node);

    const canvas = await html2canvas(node, {
      backgroundColor: '#070b18',
      logging: false,
      scale: 2,
      useCORS: true,
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Unable to render the card image.');
    return blob;
  }

  async shareOrDownload(blob: Blob, cardName: string): Promise<CardShareResult> {
    const filename = `${this.slugify(cardName)}-deep-sky-duels.png`;
    const file = new File([blob], filename, { type: 'image/png' });
    const shareData: ShareData = { files: [file], title: cardName };

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share(shareData);
      return 'shared';
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  }

  private async waitForImages(node: HTMLElement): Promise<void> {
    const images = Array.from(node.querySelectorAll('img'));
    await Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => reject(new Error('Unable to load the card image.')), { once: true });
        });
      }),
    );
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}

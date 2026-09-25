import { TestBed } from '@angular/core/testing';
import { CardShareService } from './card-share.service';

describe('CardShareService', () => {
  let service: CardShareService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CardShareService);
  });

  it('downloads the image when file sharing is unavailable', async () => {
    spyOn(navigator, 'canShare').and.returnValue(false);
    const createElement = document.createElement.bind(document);
    const link = document.createElement('a');
    spyOn(link, 'click');
    spyOn(document, 'createElement').and.callFake(((tagName: string) =>
      tagName === 'a' ? link : createElement(tagName)) as typeof document.createElement);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:card');
    spyOn(URL, 'revokeObjectURL');

    const result = await service.shareOrDownload(new Blob(['card'], { type: 'image/png' }), 'Eagle Nebula');

    expect(result).toBe('downloaded');
    expect(link.download).toBe('eagle-nebula-deep-sky-duels.png');
    expect(link.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnceWith('blob:card');
  });
});

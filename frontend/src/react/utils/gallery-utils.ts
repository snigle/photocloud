import { Photo } from '../../domain/types';

export type ListItem =
  | { type: 'header'; title: string; id: string }
  | { type: 'photo'; photo: Photo };

export const groupPhotosByDay = (photos: Photo[]): ListItem[] => {
  const groups: ListItem[] = [];
  let lastDate = '';

  photos.forEach(photo => {
    const date = new Date(photo.creationDate * 1000).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    if (date !== lastDate) {
      groups.push({ type: 'header', title: date, id: date });
      lastDate = date;
    }
    groups.push({ type: 'photo', photo });
  });

  return groups;
};

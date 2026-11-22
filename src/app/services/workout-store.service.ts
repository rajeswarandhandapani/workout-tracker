import { Injectable } from '@angular/core';
import { createDb, requestPersist } from '../kit/idb';
import type { WorkoutDay, WorkoutSettings } from '../domain/models';

@Injectable({ providedIn: 'root' })
export class WorkoutStoreService {
  private readonly db = createDb({
    name: 'workout-tracker',
    version: 1,
    stores: [{ name: 'days', keyPath: 'date' }, { name: 'kv' }],
  });

  allDays(): Promise<WorkoutDay[]> {
    return this.db.getAll<WorkoutDay>('days');
  }

  putDay(day: WorkoutDay): Promise<void> {
    requestPersist();
    return this.db.put('days', day);
  }

  deleteDay(date: string): Promise<void> {
    return this.db.del('days', date);
  }

  getKv<T>(key: string): Promise<T | undefined> {
    return this.db.getKv<T>(key);
  }

  setKv<T>(key: string, value: T): Promise<void> {
    return this.db.setKv(key, value);
  }

  eraseAll(): Promise<void> {
    return this.db.eraseAll();
  }

  replaceAll(days: WorkoutDay[], settings: WorkoutSettings): Promise<void> {
    return this.db.run(['days', 'kv'], 'readwrite', tx => {
      const dayStore = tx.objectStore('days');
      dayStore.clear();
      for (const d of days) dayStore.put(d);
      tx.objectStore('kv').put(settings, 'settings');
    });
  }
}

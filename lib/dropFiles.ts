// Files from a drag-and-drop, including whole folders (dropping a folder gives one "file" of size 0
// in dataTransfer.files; the files inside have to be walked through the directory entries).

const readFile = (entry: FileSystemFileEntry) => new Promise<File>((ok, fail) => entry.file(ok, fail));

/** A directory is read in batches; keep asking until it gives nothing more. */
async function readDirectory(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, out: File[], accept: (f: File) => boolean): Promise<void> {
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry);
    if (accept(file)) out.push(file);
  } else if (entry.isDirectory) {
    for (const child of await readDirectory(entry as FileSystemDirectoryEntry)) await walk(child, out, accept);
  }
}

/** Every dropped file that `accept` takes, folders opened (any depth). Falls back to the plain file list. */
export async function filesFromDrop(dt: DataTransfer, accept: (f: File) => boolean): Promise<File[]> {
  // The entries have to be taken now - the data transfer is emptied once the event handler returns.
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return Array.from(dt.files).filter(accept);
  const out: File[] = [];
  for (const entry of entries) await walk(entry, out, accept);
  return out;
}

export const isDxf = (f: File) => f.name.toLowerCase().endsWith(".dxf");
export const isDataFile = (f: File) => /\.(pdf|csv|txt|tsv)$/i.test(f.name) || f.type === "application/pdf";

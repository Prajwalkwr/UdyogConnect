export function containsItemById(items, id) {
  return items.some((item) => String(item.id) === String(id));
}

export function addUniqueItem(items, newItem) {
  if (containsItemById(items, newItem.id)) {
    return items;
  }

  return [...items, newItem];
}

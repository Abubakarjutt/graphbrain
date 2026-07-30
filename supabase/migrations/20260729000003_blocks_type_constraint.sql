alter table blocks
  add constraint blocks_type_check
  check (type in ('text', 'heading_1', 'heading_2', 'heading_3', 'bullet', 'numbered', 'code', 'image', 'file', 'embed'));

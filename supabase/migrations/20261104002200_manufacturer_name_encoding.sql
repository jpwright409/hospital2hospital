begin;
-- Correct two document-import encoding artifacts without replacing reference IDs.
-- Unicode escapes keep this repair safe across SQL-editor/shell encodings.
update public.manufacturers m set name='GI Supply, Inc'
where m.name='GI?Supply, Inc'
and not exists(select 1 from public.manufacturers other where other.id<>m.id
 and other.normalized_name=public.normalize_identity('GI Supply, Inc'));

update public.manufacturers m set name=U&'M\00F6lnlycke Health Care'
where m.name=U&'M\FFFDlnlycke Health Care'
and not exists(select 1 from public.manufacturers other where other.id<>m.id
 and other.normalized_name=public.normalize_identity(U&'M\00F6lnlycke Health Care'));
commit;

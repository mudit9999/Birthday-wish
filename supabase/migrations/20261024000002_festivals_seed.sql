-- North Indian (Purnimanta) festival dates for 2026 and 2027, location New Delhi.
-- Source: drikpanchang.com, checked 2026-10-24:
--   https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2026&geoname-id=1261481
--   https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027&geoname-id=1261481
--   https://www.drikpanchang.com/festivals/month/festivals-<month>.html?year=<year>&geoname-id=1261481
--     (January: Lohri; April: Ram Navami, Hanuman Jayanti; August: Raksha Bandhan, Janmashtami; October: Karwa Chauth, Diwali days)
--   https://www.drikpanchang.com/dashavatara/rama-navami/rama-navami-date-time.html?year=2026
-- Navratri entries are day 1 (Ghatasthapana). Holi is the Rangwali day. Chhath is the Sandhya Arghya day.

insert into festivals (name, date) values
  ('Lohri', '2026-01-13'),
  ('Makar Sankranti', '2026-01-14'),
  ('Vasant Panchami', '2026-01-23'),
  ('Maha Shivratri', '2026-02-15'),
  ('Holi', '2026-03-04'),
  ('Chaitra Navratri', '2026-03-19'),
  ('Ram Navami', '2026-03-26'),
  ('Hanuman Jayanti', '2026-04-02'),
  ('Raksha Bandhan', '2026-08-28'),
  ('Janmashtami', '2026-09-04'),
  ('Ganesh Chaturthi', '2026-09-14'),
  ('Sharad Navratri', '2026-10-11'),
  ('Dussehra', '2026-10-20'),
  ('Karwa Chauth', '2026-10-29'),
  ('Dhanteras', '2026-11-06'),
  ('Diwali', '2026-11-08'),
  ('Govardhan Puja', '2026-11-10'),
  ('Bhai Dooj', '2026-11-11'),
  ('Chhath', '2026-11-15'),

  ('Lohri', '2027-01-14'),
  ('Makar Sankranti', '2027-01-15'),
  ('Vasant Panchami', '2027-02-11'),
  ('Maha Shivratri', '2027-03-06'),
  ('Holi', '2027-03-22'),
  ('Chaitra Navratri', '2027-04-07'),
  ('Ram Navami', '2027-04-15'),
  ('Hanuman Jayanti', '2027-04-20'),
  ('Raksha Bandhan', '2027-08-17'),
  ('Janmashtami', '2027-08-25'),
  ('Ganesh Chaturthi', '2027-09-04'),
  ('Sharad Navratri', '2027-09-30'),
  ('Dussehra', '2027-10-09'),
  ('Karwa Chauth', '2027-10-18'),
  ('Dhanteras', '2027-10-27'),
  ('Diwali', '2027-10-29'),
  ('Govardhan Puja', '2027-10-30'),
  ('Bhai Dooj', '2027-10-31'),
  ('Chhath', '2027-11-04')
on conflict (name, date) do nothing;
